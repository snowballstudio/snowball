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
        CAPPluginMethod(name: "stopOffscreenMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startMonitorMiniTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readMonitorMiniStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readMonitorMiniCallbacks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopMonitorMiniTest", returnType: CAPPluginReturnPromise)
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


    // MARK: - DeviceActivity Monitor 最小验证

    @objc public func startMonitorMiniTest(_ call: CAPPluginCall) {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        let center = DeviceActivityCenter()
        let defaults = UserDefaults(
            suiteName: SnowballMonitorMiniDefinition.appGroup
        )

        if let previousActivityText = defaults?.string(
            forKey: SnowballMonitorMiniDefinition.lastActivityKey
        ),
           !previousActivityText.isEmpty {
            center.stopMonitoring([
                DeviceActivityName(previousActivityText)
            ])
        }

        let now = Date()
        let calendar = Calendar.autoupdatingCurrent

        guard let startDate = calendar.date(
            byAdding: .minute,
            value: 2,
            to: now
        ),
        let endDate = calendar.date(
            byAdding: .minute,
            value: 15,
            to: startDate
        ) else {
            call.reject("无法计算最小测试时间段。")
            return
        }

        let token = SnowballMonitorMiniDefinition.token(for: now)
        let activity = DeviceActivityName(
            "snowball.monitor.mini.\(token)"
        )
        let eventName = DeviceActivityEvent.Name(
            "snowball.monitor.mini.one-minute.\(token)"
        )

        let schedule = DeviceActivitySchedule(
            intervalStart: calendar.dateComponents(
                [.calendar, .timeZone, .year, .month, .day, .hour, .minute],
                from: startDate
            ),
            intervalEnd: calendar.dateComponents(
                [.calendar, .timeZone, .year, .month, .day, .hour, .minute],
                from: endDate
            ),
            repeats: false
        )

        let testEvent: DeviceActivityEvent
        if #available(iOS 17.4, *) {
            testEvent = DeviceActivityEvent(
                threshold: DateComponents(minute: 1),
                includesPastActivity: false
            )
        } else {
            testEvent = DeviceActivityEvent(
                threshold: DateComponents(minute: 1)
            )
        }

        let events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [
            eventName: testEvent
        ]

        do {
            try center.startMonitoring(
                activity,
                during: schedule,
                events: events
            )

            let systemActivities = center.activities
            let storedSchedule = center.schedule(for: activity)
            let storedEvents = center.events(for: activity)
            let registered = systemActivities.contains(activity)
                && storedSchedule != nil
                && storedEvents[eventName] != nil

            defaults?.removeObject(
                forKey: SnowballMonitorMiniDefinition.callbackLogKey
            )
            defaults?.set(
                ISO8601DateFormatter().string(from: now),
                forKey: SnowballMonitorMiniDefinition.registeredAtKey
            )
            defaults?.set(
                activity.rawValue,
                forKey: SnowballMonitorMiniDefinition.lastActivityKey
            )
            defaults?.set(
                eventName.rawValue,
                forKey: SnowballMonitorMiniDefinition.lastEventKey
            )
            defaults?.set(
                ISO8601DateFormatter().string(from: startDate),
                forKey: SnowballMonitorMiniDefinition.lastStartKey
            )
            defaults?.set(
                ISO8601DateFormatter().string(from: endDate),
                forKey: SnowballMonitorMiniDefinition.lastEndKey
            )

            call.resolve([
                "started": true,
                "systemConfirmed": registered,
                "activityName": activity.rawValue,
                "eventName": eventName.rawValue,
                "activityCount": systemActivities.count,
                "systemActivities": systemActivities.map(\.rawValue),
                "eventCount": storedEvents.count,
                "scheduleExists": storedSchedule != nil,
                "repeats": false,
                "includesPastActivity": false,
                "scheduledStart": ISO8601DateFormatter().string(
                    from: startDate
                ),
                "scheduledEnd": ISO8601DateFormatter().string(
                    from: endDate
                ),
                "message": registered
                    ? "系统已登记一次性测试：2分钟后开始，持续15分钟。开始后正常使用手机1分钟，再读取回调。"
                    : "startMonitoring未报错，但系统反查不完整，请读取注册状态。"
            ])
        } catch {
            call.reject(
                "最小Monitor注册失败：\(error.localizedDescription)",
                nil,
                error
            )
        }
    }

    @objc public func readMonitorMiniStatus(_ call: CAPPluginCall) {
        let center = DeviceActivityCenter()

        guard let defaults = UserDefaults(
            suiteName: SnowballMonitorMiniDefinition.appGroup
        ) else {
            call.reject("无法打开Monitor测试的App Group。")
            return
        }

        let activityText = defaults.string(
            forKey: SnowballMonitorMiniDefinition.lastActivityKey
        ) ?? ""
        let eventText = defaults.string(
            forKey: SnowballMonitorMiniDefinition.lastEventKey
        ) ?? ""

        guard !activityText.isEmpty, !eventText.isEmpty else {
            call.resolve([
                "registered": false,
                "systemConfirmed": false,
                "message": "还没有登记本轮最小测试，请先点①注册 Monitor。"
            ])
            return
        }

        let activity = DeviceActivityName(activityText)
        let eventName = DeviceActivityEvent.Name(eventText)
        let activities = center.activities
        let schedule = center.schedule(for: activity)
        let events = center.events(for: activity)

        let schedulePayload: [String: Any] = [
            "exists": schedule != nil,
            "repeats": schedule?.repeats ?? false,
            "intervalStartYear": schedule?.intervalStart.year ?? -1,
            "intervalStartMonth": schedule?.intervalStart.month ?? -1,
            "intervalStartDay": schedule?.intervalStart.day ?? -1,
            "intervalStartHour": schedule?.intervalStart.hour ?? -1,
            "intervalStartMinute": schedule?.intervalStart.minute ?? -1,
            "intervalEndYear": schedule?.intervalEnd.year ?? -1,
            "intervalEndMonth": schedule?.intervalEnd.month ?? -1,
            "intervalEndDay": schedule?.intervalEnd.day ?? -1,
            "intervalEndHour": schedule?.intervalEnd.hour ?? -1,
            "intervalEndMinute": schedule?.intervalEnd.minute ?? -1,
            "scheduledStart": defaults.string(
                forKey: SnowballMonitorMiniDefinition.lastStartKey
            ) ?? "",
            "scheduledEnd": defaults.string(
                forKey: SnowballMonitorMiniDefinition.lastEndKey
            ) ?? ""
        ]

        let eventPayload = events.map { name, event in
            [
                "name": name.rawValue,
                "thresholdHour": event.threshold.hour ?? 0,
                "thresholdMinute": event.threshold.minute ?? 0,
                "thresholdSecond": event.threshold.second ?? 0,
                "includesPastActivity": event.includesPastActivity,
                "includesAllActivity": event.includesAllActivity
            ] as [String: Any]
        }.sorted {
            ($0["name"] as? String ?? "") < ($1["name"] as? String ?? "")
        }

        call.resolve([
            "authorization": self.statusPayload(),
            "registered": activities.contains(activity),
            "systemActivities": activities.map(\.rawValue),
            "activityName": activity.rawValue,
            "expectedEventName": eventName.rawValue,
            "schedule": schedulePayload,
            "events": eventPayload,
            "systemConfirmed":
                activities.contains(activity)
                && schedule != nil
                && events[eventName] != nil
        ])
    }

    @objc public func readMonitorMiniCallbacks(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(
            suiteName: SnowballMonitorMiniDefinition.appGroup
        ) else {
            call.reject("无法打开Monitor测试的App Group。")
            return
        }

        let registeredAt = defaults.string(
            forKey: SnowballMonitorMiniDefinition.registeredAtKey
        ) ?? ""

        guard let data = defaults.data(
            forKey: SnowballMonitorMiniDefinition.callbackLogKey
        ) else {
            call.resolve([
                "registeredAt": registeredAt,
                "callbacks": [],
                "callbackCount": 0,
                "message": "系统登记状态可以单独读取；目前共享容器中还没有Monitor回调。"
            ])
            return
        }

        do {
            let object = try JSONSerialization.jsonObject(with: data)
            let callbacks = object as? [[String: Any]] ?? []
            call.resolve([
                "registeredAt": registeredAt,
                "callbacks": callbacks,
                "callbackCount": callbacks.count,
                "message": callbacks.isEmpty
                    ? "目前还没有Monitor回调。"
                    : "已收到Monitor Extension回调。"
            ])
        } catch {
            call.reject(
                "读取Monitor最小测试回调失败：\(error.localizedDescription)",
                nil,
                error
            )
        }
    }

    @objc public func stopMonitorMiniTest(_ call: CAPPluginCall) {
        let center = DeviceActivityCenter()
        let defaults = UserDefaults(
            suiteName: SnowballMonitorMiniDefinition.appGroup
        )
        let activityText = defaults?.string(
            forKey: SnowballMonitorMiniDefinition.lastActivityKey
        ) ?? ""

        if !activityText.isEmpty {
            center.stopMonitoring([
                DeviceActivityName(activityText)
            ])
        }

        let remaining = center.activities
        call.resolve([
            "stopped": true,
            "activityName": activityText,
            "stillRegistered": !activityText.isEmpty
                && remaining.contains(
                    DeviceActivityName(activityText)
                ),
            "systemActivities": remaining.map(\.rawValue)
        ])
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



private enum SnowballMonitorMiniDefinition {
    static let appGroup = "group.com.snowball.health"
    static let callbackLogKey =
        "snowball.monitor.mini.callbacks.v1"
    static let registeredAtKey =
        "snowball.monitor.mini.registeredAt"
    static let lastActivityKey =
        "snowball.monitor.mini.lastActivity.v2"
    static let lastEventKey =
        "snowball.monitor.mini.lastEvent.v2"
    static let lastStartKey =
        "snowball.monitor.mini.lastStart.v2"
    static let lastEndKey =
        "snowball.monitor.mini.lastEnd.v2"

    static func token(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = Calendar.autoupdatingCurrent.timeZone
        formatter.dateFormat = "yyyyMMddHHmmss"
        return formatter.string(from: date)
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
