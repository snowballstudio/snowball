import Foundation
import Capacitor
import DeviceActivity
import FamilyControls
import SwiftUI
import UIKit

@objc(IOSScreenTimePlugin)
public class IOSScreenTimePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IOSScreenTimePlugin"
    public let jsName = "IOSScreenTime"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentReport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readActivityData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startOffscreenMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readOffscreenMonitoringData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopOffscreenMonitoring", returnType: CAPPluginReturnPromise)
    ]

    @objc public func getAuthorizationStatus(_ call: CAPPluginCall) {
        call.resolve(statusPayload())
    }

    @objc public func requestAuthorization(_ call: CAPPluginCall) {
        Task {
            do {
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                await MainActor.run {
                    call.resolve(self.statusPayload())
                }
            } catch {
                await MainActor.run {
                    call.reject(
                        "苹果屏幕时间授权失败：\(error.localizedDescription)",
                        nil,
                        error
                    )
                }
            }
        }
    }

    @objc public func presentReport(_ call: CAPPluginCall) {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        let date = parseSnowballDate(call.getString("date")) ?? Date()
        let calendar = Calendar.autoupdatingCurrent
        let dayStart = calendar.startOfDay(for: date)

        // 使用标准自然日区间：当天 00:00 到次日 00:00。
        // 避免非整点 hourly 区间导致系统无法生成报告配置。
        guard let end = calendar.date(
            byAdding: .day,
            value: 1,
            to: dayStart
        ) else {
            call.reject("无法计算屏幕时间报告区间。")
            return
        }

        let interval = DateInterval(start: dayStart, end: end)
        let filter = DeviceActivityFilter(
            segment: .hourly(during: interval),
            users: .all,
            devices: .all
        )

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("找不到雪球主页面。")
                return
            }

            let context = DeviceActivityReport.Context("Total Activity")
            let reportView = IOSScreenTimeReportContainer(
                context: context,
                filter: filter,
                dateText: self.formatSnowballDate(dayStart) + "（00:00–次日00:00）",
                onClose: {
                    presenter.dismiss(animated: true)
                }
            )

            let host = UIHostingController(rootView: reportView)
            host.modalPresentationStyle = .fullScreen
            presenter.present(host, animated: true) {
                call.resolve([
                    "opened": true,
                    "date": self.formatSnowballDate(dayStart)
                ])
            }
        }
    }


    @objc public func readActivityData(_ call: CAPPluginCall) {
        guard AuthorizationCenter.shared.authorizationStatus
                == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        guard let defaults = UserDefaults(
            suiteName: "group.com.snowball.health"
        ) else {
            call.reject("无法打开雪球 App Group 共享容器。")
            return
        }

        guard let data = defaults.data(
            forKey: "snowball.ios-screen-time.days.v1"
        ) else {
            call.resolve([
                "days": [],
                "message":
                    "共享容器中还没有报告数据，请先打开一次对应日期的苹果系统报告。"
            ])
            return
        }

        do {
            guard let cache = try JSONSerialization
                .jsonObject(with: data) as? [String: Any] else {
                call.reject("苹果屏幕时间共享数据格式无效。")
                return
            }

            let allDays =
                cache["days"] as? [[String: Any]] ?? []
            let requestedEndDate =
                parseSnowballDate(call.getString("startDate"))
                ?? Date()
            let requestedCount =
                max(1, call.getInt("days") ?? 1)
            let calendar = Calendar.autoupdatingCurrent
            let endDate = calendar.startOfDay(
                for: requestedEndDate
            )
            let startDate = calendar.date(
                byAdding: .day,
                value: -(requestedCount - 1),
                to: endDate
            ) ?? endDate

            let filteredDays = allDays.filter { day in
                guard let text = day["date"] as? String,
                      let date = self.parseSnowballDate(text)
                else {
                    return false
                }

                let normalized =
                    calendar.startOfDay(for: date)
                return normalized >= startDate
                    && normalized <= endDate
            }.sorted { left, right in
                (left["date"] as? String ?? "")
                    < (right["date"] as? String ?? "")
            }

            call.resolve([
                "days": filteredDays,
                "updatedAt": cache["updatedAt"] ?? "",
                "version": cache["version"] ?? 1,
                "source": "ios-device-activity-report-cache"
            ])
        } catch {
            call.reject(
                "读取苹果屏幕时间共享数据失败：\(error.localizedDescription)",
                nil,
                error
            )
        }
    }


    // MARK: - Snowball 离机时间 Monitor 测试

    @objc public func startOffscreenMonitoring(_ call: CAPPluginCall) {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        let center = DeviceActivityCenter()
        let activityNames = SnowballOffscreenMonitorDefinition.activityNames

        // 先停止旧监控，避免重复注册或旧事件残留。
        center.stopMonitoring(activityNames)

        do {
            try center.startMonitoring(
                SnowballOffscreenMonitorDefinition.eveningEarly,
                during: SnowballOffscreenMonitorDefinition.schedule(
                    startHour: 20,
                    endHour: 22
                ),
                events: SnowballOffscreenMonitorDefinition.events(
                    prefix: "g1",
                    intervalMinutes: 10,
                    maximumMinutes: 120
                )
            )

            try center.startMonitoring(
                SnowballOffscreenMonitorDefinition.eveningLate,
                during: SnowballOffscreenMonitorDefinition.schedule(
                    startHour: 22,
                    endHour: 1
                ),
                events: SnowballOffscreenMonitorDefinition.events(
                    prefix: "g2",
                    intervalMinutes: 5,
                    maximumMinutes: 180
                )
            )

            try center.startMonitoring(
                SnowballOffscreenMonitorDefinition.afterMidnight,
                during: SnowballOffscreenMonitorDefinition.schedule(
                    startHour: 1,
                    endHour: 5
                ),
                events: SnowballOffscreenMonitorDefinition.events(
                    prefix: "g3",
                    intervalMinutes: 10,
                    maximumMinutes: 240
                )
            )

            let defaults = UserDefaults(
                suiteName: SnowballOffscreenMonitorDefinition.appGroup
            )
            defaults?.set(
                ISO8601DateFormatter().string(from: Date()),
                forKey: "snowball.offscreen.monitor.registeredAt"
            )

            call.resolve([
                "started": true,
                "activities": activityNames.map(\.rawValue),
                "eventCount": 72,
                "message": "已启动三组苹果离机时间监控。"
            ])
        } catch {
            call.reject(
                "启动苹果离机时间监控失败：\(error.localizedDescription)",
                nil,
                error
            )
        }
    }

    @objc public func stopOffscreenMonitoring(_ call: CAPPluginCall) {
        let center = DeviceActivityCenter()
        center.stopMonitoring(
            SnowballOffscreenMonitorDefinition.activityNames
        )
        call.resolve([
            "stopped": true
        ])
    }

    @objc public func readOffscreenMonitoringData(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(
            suiteName: SnowballOffscreenMonitorDefinition.appGroup
        ) else {
            call.reject("无法打开雪球 App Group 共享容器。")
            return
        }

        let registeredAt = defaults.string(
            forKey: "snowball.offscreen.monitor.registeredAt"
        ) ?? ""

        guard let data = defaults.data(
            forKey: SnowballOffscreenMonitorDefinition.cacheKey
        ) else {
            call.resolve([
                "records": [],
                "registeredAt": registeredAt,
                "message": "监控已经可以注册，但目前还没有收到阈值回调。"
            ])
            return
        }

        do {
            let object = try JSONSerialization.jsonObject(with: data)
            let records = object as? [[String: Any]] ?? []
            call.resolve([
                "records": records,
                "registeredAt": registeredAt,
                "source": "ios-device-activity-monitor"
            ])
        } catch {
            call.reject(
                "读取苹果离机时间 Monitor 数据失败：\(error.localizedDescription)",
                nil,
                error
            )
        }
    }

    private func statusPayload() -> [String: Any] {
        let status = AuthorizationCenter.shared.authorizationStatus

        if status == .approved {
            return [
                "available": true,
                "status": "approved",
                "statusLabel": "已授权"
            ]
        }

        if status == .denied {
            return [
                "available": true,
                "status": "denied",
                "statusLabel": "已拒绝"
            ]
        }

        if status == .notDetermined {
            return [
                "available": true,
                "status": "notDetermined",
                "statusLabel": "未询问"
            ]
        }

        return [
            "available": true,
            "status": "unknown",
            "statusLabel": "未知状态"
        ]
    }

    private func parseSnowballDate(_ value: String?) -> Date? {
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            return nil
        }

        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = Calendar.autoupdatingCurrent.timeZone

        for format in ["yyyy/M/d", "yyyy-MM-dd"] {
            formatter.dateFormat = format
            if let date = formatter.date(from: text) {
                return date
            }
        }

        return nil
    }

    private func formatSnowballDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = Calendar.autoupdatingCurrent.timeZone
        formatter.dateFormat = "yyyy/M/d"
        return formatter.string(from: date)
    }
}

private struct IOSScreenTimeReportContainer: View {
    let context: DeviceActivityReport.Context
    let filter: DeviceActivityFilter
    let dateText: String
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            DeviceActivityReport(context, filter: filter)
                .navigationTitle("苹果屏幕时间 \(dateText)")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("关闭", action: onClose)
                    }
                }
        }
    }
}


private enum SnowballOffscreenMonitorDefinition {
    static let appGroup = "group.com.snowball.health"
    static let cacheKey = "snowball.offscreen.monitor.records.v1"

    static let eveningEarly =
        DeviceActivityName("snowball.offscreen.20-22")
    static let eveningLate =
        DeviceActivityName("snowball.offscreen.22-01")
    static let afterMidnight =
        DeviceActivityName("snowball.offscreen.01-05")

    static let activityNames: [DeviceActivityName] = [
        eveningEarly,
        eveningLate,
        afterMidnight
    ]

    static func schedule(
        startHour: Int,
        endHour: Int
    ) -> DeviceActivitySchedule {
        DeviceActivitySchedule(
            intervalStart: DateComponents(
                hour: startHour,
                minute: 0
            ),
            intervalEnd: DateComponents(
                hour: endHour,
                minute: 0
            ),
            repeats: true
        )
    }

    static func events(
        prefix: String,
        intervalMinutes: Int,
        maximumMinutes: Int
    ) -> [DeviceActivityEvent.Name: DeviceActivityEvent] {
        var result: [
            DeviceActivityEvent.Name: DeviceActivityEvent
        ] = [:]

        guard intervalMinutes > 0,
              maximumMinutes >= intervalMinutes else {
            return result
        }

        for minutes in stride(
            from: intervalMinutes,
            through: maximumMinutes,
            by: intervalMinutes
        ) {
            let eventName = DeviceActivityEvent.Name(
                String(
                    format: "snowball.offscreen.%@.%03d",
                    prefix,
                    minutes
                )
            )

            result[eventName] = DeviceActivityEvent(
                threshold: DateComponents(minute: minutes)
            )
        }

        return result
    }
}
