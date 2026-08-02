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
        CAPPluginMethod(name: "presentSevenDayReport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refreshSevenDaySummary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readActivityData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "debugReadScreenTimeCache", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startOffscreenMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readOffscreenMonitoringData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopOffscreenMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startMonitorMiniTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readMonitorMiniStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentMonitorAppPicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readMonitorAppSelection", returnType: CAPPluginReturnPromise),
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


    @objc public func presentSevenDayReport(_ call: CAPPluginCall) {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        let calendar = Calendar.autoupdatingCurrent
        let today = calendar.startOfDay(for: Date())

        guard
            let yesterday = calendar.date(
                byAdding: .day,
                value: -1,
                to: today
            ),
            let start = calendar.date(
                byAdding: .day,
                value: -6,
                to: yesterday
            ),
            let end = calendar.date(
                byAdding: .day,
                value: 1,
                to: yesterday
            )
        else {
            call.reject("无法计算七日屏幕时间区间。")
            return
        }

        let filter = DeviceActivityFilter(
            segment: .daily(
                during: DateInterval(
                    start: start,
                    end: end
                )
            ),
            users: .all,
            devices: .all
        )

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("找不到雪球主页面。")
                return
            }

            let context = DeviceActivityReport.Context(
                "Snowball Seven Day Average"
            )
            let reportView = IOSSevenDayReportContainer(
                context: context,
                filter: filter,
                onClose: {
                    presenter.dismiss(animated: true) {
                        call.resolve([
                            "closed": true,
                            "startDate": self.formatSnowballDate(start),
                            "endDate": self.formatSnowballDate(yesterday)
                        ])
                    }
                }
            )

            let host = UIHostingController(rootView: reportView)
            host.modalPresentationStyle = .fullScreen
            presenter.present(host, animated: true)
        }
    }


    @objc public func refreshSevenDaySummary(
        _ call: CAPPluginCall
    ) {
        guard AuthorizationCenter.shared.authorizationStatus
                == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        let calendar = Calendar.autoupdatingCurrent
        let today = calendar.startOfDay(for: Date())

        guard
            let yesterday = calendar.date(
                byAdding: .day,
                value: -1,
                to: today
            ),
            let start = calendar.date(
                byAdding: .day,
                value: -6,
                to: yesterday
            ),
            let end = calendar.date(
                byAdding: .day,
                value: 1,
                to: yesterday
            )
        else {
            call.reject("无法计算七日屏幕时间区间。")
            return
        }

        let filter = DeviceActivityFilter(
            segment: .daily(
                during: DateInterval(
                    start: start,
                    end: end
                )
            ),
            users: .all,
            devices: .all
        )

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("找不到雪球主页面。")
                return
            }

            let report = DeviceActivityReport(
                .init("Snowball Seven Day Average"),
                filter: filter
            )
            let host = UIHostingController(rootView: report)

            presenter.addChild(host)
            // DeviceActivityReport 必须真正进入可布局的视图层级，
            // 过小或完全移出屏幕的视图在部分 iPhone 上不会启动 Report Extension。
            // 这里给它一个屏幕内的有效尺寸，但保持几乎透明且不可交互。
            let bounds = presenter.view.bounds
            host.view.frame = CGRect(
                x: 0,
                y: 0,
                width: max(240, bounds.width),
                height: max(240, min(bounds.height, 420))
            )
            host.view.alpha = 0.02
            host.view.isUserInteractionEnabled = false
            host.view.backgroundColor = .clear
            host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            presenter.view.insertSubview(host.view, at: 0)
            host.didMove(toParent: presenter)
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()

            let startedAt = Date()
            self.waitForSevenDaySummary(
                newerThan: startedAt,
                attemptsRemaining: 80
            ) { payload in
                DispatchQueue.main.async {
                    host.willMove(toParent: nil)
                    host.view.removeFromSuperview()
                    host.removeFromParent()

                    if let payload {
                        call.resolve(payload)
                    } else {
                        call.reject(
                            "苹果七日屏幕时间仍在准备，请稍后重新打开雪球。"
                        )
                    }
                }
            }
        }
    }



    private let screenTimeAppGroupIdentifier =
        "group.com.snowball.health"
    private let screenTimeDetailFileName =
        "snowball-ios-screen-time-days-v1.json"
    private let screenTimeSummaryFileName =
        "snowball-ios-screen-time-seven-day-summary-v1.json"
    private let screenTimeDiagnosticFileName =
        "snowball-ios-screen-time-extension-diagnostic-v1.json"

    private func screenTimeSharedFileData(
        fileName: String
    ) -> Data? {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier:
                screenTimeAppGroupIdentifier
        ) else {
            return nil
        }

        return try? Data(
            contentsOf: containerURL.appendingPathComponent(
                fileName,
                isDirectory: false
            )
        )
    }


    @objc public func debugReadScreenTimeCache(
        _ call: CAPPluginCall
    ) {
        let appGroupIdentifier = "group.com.snowball.health"
        let summaryKey =
            "snowball.ios-screen-time.seven-day-summary.v1"
        let detailKey =
            "snowball.ios-screen-time.days.v1"

        guard let defaults = UserDefaults(
            suiteName: appGroupIdentifier
        ) else {
            call.resolve([
                "groupExists": false,
                "appGroupIdentifier": appGroupIdentifier,
                "message": "主 App 无法打开 App Group。"
            ])
            return
        }

        let containerPath = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier:
                appGroupIdentifier
        )?.path ?? ""

        let summaryDefaultsData =
            defaults.data(forKey: summaryKey)
        let detailDefaultsData =
            defaults.data(forKey: detailKey)
        let summaryFileData = screenTimeSharedFileData(
            fileName: screenTimeSummaryFileName
        )
        let detailFileData = screenTimeSharedFileData(
            fileName: screenTimeDetailFileName
        )
        let extensionDiagnosticData =
            screenTimeSharedFileData(
                fileName: screenTimeDiagnosticFileName
            )

        let summaryData =
            summaryFileData ?? summaryDefaultsData
        let detailData =
            detailFileData ?? detailDefaultsData

        func dictionary(
            from data: Data?
        ) -> [String: Any]? {
            guard let data else {
                return nil
            }

            return try? JSONSerialization
                .jsonObject(with: data) as? [String: Any]
        }

        func jsonPreview(
            _ data: Data?
        ) -> String {
            guard let data else {
                return ""
            }

            let maximumBytes = 16_000
            let previewData = data.prefix(maximumBytes)
            let text = String(
                data: previewData,
                encoding: .utf8
            ) ?? "<无法转换为 UTF-8>"

            return data.count > maximumBytes
                ? text + "\n…（内容已截断）"
                : text
        }

        let summaryObject = dictionary(from: summaryData)
        let detailObject = dictionary(from: detailData)

        let summaryDays =
            summaryObject?["days"] as? [[String: Any]] ?? []
        let detailDays =
            detailObject?["days"] as? [[String: Any]] ?? []

        let summaryDates = summaryDays.compactMap {
            $0["date"] as? String
        }
        let detailDates = detailDays.compactMap {
            $0["date"] as? String
        }

        call.resolve([
            "groupExists": true,
            "appGroupIdentifier": appGroupIdentifier,
            "containerPath": containerPath,

            "summaryKey": summaryKey,
            "summaryExists": summaryData != nil,
            "summaryBytes": summaryData?.count ?? 0,
            "summaryJSONValid": summaryObject != nil,
            "summaryAverageMinutes":
                summaryObject?["averageMinutes"] ?? NSNull(),
            "summaryDayCount":
                summaryObject?["dayCount"] ?? summaryDays.count,
            "summaryDaysCount": summaryDays.count,
            "summaryDates": summaryDates,
            "summaryUpdatedAt":
                summaryObject?["updatedAt"] ?? "",
            "summaryVersion":
                summaryObject?["version"] ?? NSNull(),
            "summaryJSONPreview": jsonPreview(summaryData),

            "detailKey": detailKey,
            "detailExists": detailData != nil,
            "detailBytes": detailData?.count ?? 0,
            "detailJSONValid": detailObject != nil,
            "detailDaysCount": detailDays.count,
            "detailDates": detailDates,
            "detailUpdatedAt":
                detailObject?["updatedAt"] ?? "",
            "detailVersion":
                detailObject?["version"] ?? NSNull(),
            "detailJSONPreview": jsonPreview(detailData),

            "summaryDefaultsExists":
                summaryDefaultsData != nil,
            "summaryFileExists":
                summaryFileData != nil,
            "summaryFileBytes":
                summaryFileData?.count ?? 0,
            "detailDefaultsExists":
                detailDefaultsData != nil,
            "detailFileExists":
                detailFileData != nil,
            "detailFileBytes":
                detailFileData?.count ?? 0,
            "extensionDiagnosticExists":
                extensionDiagnosticData != nil,
            "extensionDiagnosticBytes":
                extensionDiagnosticData?.count ?? 0,
            "extensionDiagnosticPreview":
                jsonPreview(extensionDiagnosticData),

            "allSharedDefaultsKeys":
                Array(defaults.dictionaryRepresentation().keys)
                    .sorted(),
            "checkedAt":
                ISO8601DateFormatter().string(from: Date())
        ])
    }


    @objc public func readActivityData(_ call: CAPPluginCall) {
        guard AuthorizationCenter.shared.authorizationStatus
                == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        guard let defaults = UserDefaults(
            suiteName: screenTimeAppGroupIdentifier
        ) else {
            call.reject("无法打开雪球 App Group 共享容器。")
            return
        }

        let detailDefaultsData = defaults.data(
            forKey: "snowball.ios-screen-time.days.v1"
        )
        let summaryDefaultsData = defaults.data(
            forKey:
                "snowball.ios-screen-time.seven-day-summary.v1"
        )

        let detailFileData = screenTimeSharedFileData(
            fileName: screenTimeDetailFileName
        )
        let summaryFileData = screenTimeSharedFileData(
            fileName: screenTimeSummaryFileName
        )

        // 共享文件优先，旧 UserDefaults 作为兼容回退。
        let detailData =
            detailFileData ?? detailDefaultsData
        let summaryData =
            summaryFileData ?? summaryDefaultsData

        do {
            let detailCache: [String: Any] = {
                guard let detailData,
                      let object = try? JSONSerialization
                        .jsonObject(with: detailData)
                        as? [String: Any] else {
                    return [:]
                }
                return object
            }()

            let summaryCache: [String: Any] = {
                guard let summaryData,
                      let object = try? JSONSerialization
                        .jsonObject(with: summaryData)
                        as? [String: Any] else {
                    return [:]
                }
                return object
            }()

            var daysByDate: [String: [String: Any]] = [:]

            for day in (
                detailCache["days"] as? [[String: Any]] ?? []
            ) {
                if let date = day["date"] as? String {
                    daysByDate[date] = day
                }
            }

            // 七日汇总包含完整的每日总时长与 App TOP 数据，
            // 应覆盖旧的空数据；已有分时详情仍保留在 detail cache。
            for summaryDay in (
                summaryCache["days"] as? [[String: Any]] ?? []
            ) {
                guard let date =
                    summaryDay["date"] as? String else {
                    continue
                }

                if var detailed = daysByDate[date] {
                    detailed["screenMinutes"] =
                        summaryDay["screenMinutes"]
                    detailed["totalActivitySeconds"] =
                        summaryDay["totalActivitySeconds"]
                    detailed["apps"] = summaryDay["apps"]
                    daysByDate[date] = detailed
                } else {
                    daysByDate[date] = summaryDay
                }
            }

            let allDays = daysByDate.values.sorted {
                ($0["date"] as? String ?? "")
                    < ($1["date"] as? String ?? "")
            }
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
                "sevenDayAverageMinutes":
                    summaryCache["averageMinutes"] ?? 0,
                "sevenDayCount":
                    summaryCache["dayCount"] ?? 7,
                "updatedAt":
                    summaryCache["updatedAt"]
                    ?? detailCache["updatedAt"]
                    ?? "",
                "version":
                    summaryCache["version"]
                    ?? detailCache["version"]
                    ?? 1,
                "source":
                    "ios-device-activity-report-cache",
                "summaryTransport":
                    summaryFileData != nil
                    ? "app-group-file"
                    : (
                        summaryDefaultsData != nil
                        ? "app-group-user-defaults"
                        : "missing"
                    ),
                "detailTransport":
                    detailFileData != nil
                    ? "app-group-file"
                    : (
                        detailDefaultsData != nil
                        ? "app-group-user-defaults"
                        : "missing"
                    )
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


    // MARK: - 单 App Monitor 选择器

    @objc public func presentMonitorAppPicker(_ call: CAPPluginCall) {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("找不到雪球主页面。")
                return
            }

            let picker = IOSMonitorAppPickerView(
                onSave: { selection in
                    guard selection.applicationTokens.count == 1,
                          selection.categoryTokens.isEmpty,
                          selection.webDomainTokens.isEmpty else {
                        call.reject("请只选择一个 App，不要选择类别或网站。")
                        return
                    }

                    do {
                        let data = try JSONEncoder().encode(selection)
                        let defaults = UserDefaults(
                            suiteName: SnowballMonitorMiniDefinition.appGroup
                        )
                        defaults?.set(
                            data,
                            forKey: SnowballMonitorMiniDefinition.selectionKey
                        )
                        defaults?.set(
                            ISO8601DateFormatter().string(from: Date()),
                            forKey: SnowballMonitorMiniDefinition.selectionSavedAtKey
                        )

                        presenter.dismiss(animated: true) {
                            call.resolve([
                                "selected": true,
                                "applicationCount": 1,
                                "message": "已保存一个测试 App。下一步请注册 Monitor。"
                            ])
                        }
                    } catch {
                        presenter.dismiss(animated: true) {
                            call.reject(
                                "保存测试 App 失败：\(error.localizedDescription)",
                                nil,
                                error
                            )
                        }
                    }
                },
                onCancel: {
                    presenter.dismiss(animated: true) {
                        call.resolve([
                            "selected": false,
                            "message": "已取消选择测试 App。"
                        ])
                    }
                }
            )

            let host = UIHostingController(rootView: picker)
            host.modalPresentationStyle = .fullScreen
            presenter.present(host, animated: true)
        }
    }

    @objc public func readMonitorAppSelection(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(
            suiteName: SnowballMonitorMiniDefinition.appGroup
        ) else {
            call.reject("无法打开 Monitor 测试的 App Group。")
            return
        }

        guard let data = defaults.data(
            forKey: SnowballMonitorMiniDefinition.selectionKey
        ),
        let selection = try? JSONDecoder().decode(
            FamilyActivitySelection.self,
            from: data
        ) else {
            call.resolve([
                "selected": false,
                "applicationCount": 0,
                "message": "尚未选择测试 App。"
            ])
            return
        }

        call.resolve([
            "selected": selection.applicationTokens.count == 1,
            "applicationCount": selection.applicationTokens.count,
            "categoryCount": selection.categoryTokens.count,
            "webDomainCount": selection.webDomainTokens.count,
            "savedAt": defaults.string(
                forKey: SnowballMonitorMiniDefinition.selectionSavedAtKey
            ) ?? ""
        ])
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

        guard let selectionData = defaults?.data(
            forKey: SnowballMonitorMiniDefinition.selectionKey
        ),
        let selection = try? JSONDecoder().decode(
            FamilyActivitySelection.self,
            from: selectionData
        ),
        selection.applicationTokens.count == 1,
        selection.categoryTokens.isEmpty,
        selection.webDomainTokens.isEmpty else {
            call.reject("请先点①选择测试 App，并且只选择一个 App。")
            return
        }

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

        let events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [
            eventName: DeviceActivityEvent(
                applications: selection.applicationTokens,
                categories: [],
                webDomains: [],
                threshold: DateComponents(minute: 1)
            )
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
                "pastActivityIncluded": false,
                "selectedApplicationCount": selection.applicationTokens.count,
                "monitorScope": "one-selected-application",
                "scheduledStart": ISO8601DateFormatter().string(
                    from: startDate
                ),
                "scheduledEnd": ISO8601DateFormatter().string(
                    from: endDate
                ),
                "message": registered
                    ? "系统已登记单 App 测试：2分钟后开始，持续15分钟。开始后只使用刚才选择的 App 至少1分钟，再读取回调。"
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

        let selection: FamilyActivitySelection? = defaults.data(
            forKey: SnowballMonitorMiniDefinition.selectionKey
        ).flatMap {
            try? JSONDecoder().decode(
                FamilyActivitySelection.self,
                from: $0
            )
        }

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
            "selectedApplicationCount": selection?.applicationTokens.count ?? 0,
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

    private func waitForSevenDaySummary(
        newerThan startedAt: Date,
        attemptsRemaining: Int,
        completion: @escaping ([String: Any]?) -> Void
    ) {
        let defaults = UserDefaults(
            suiteName: "group.com.snowball.health"
        )

        if let data = defaults?.data(
            forKey:
                "snowball.ios-screen-time.seven-day-summary.v1"
        ),
        let object = try? JSONSerialization
            .jsonObject(with: data) as? [String: Any],
        let updatedText = object["updatedAt"] as? String,
        let updatedDate =
            ISO8601DateFormatter().date(from: updatedText),
        updatedDate >= startedAt.addingTimeInterval(-1) {
            let days = object["days"] as? [[String: Any]] ?? []
            let validDays = days.filter { day in
                guard let date = day["date"] as? String,
                      !date.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                else { return false }
                return day["screenMinutes"] != nil
                    || day["totalActivitySeconds"] != nil
                    || day["apps"] != nil
            }

            // 苹果第一次启动 Report Extension 时，可能先写入一个空快照，
            // 随后才写入真正的七日结果。空快照不能作为刷新成功返回。
            if !validDays.isEmpty {
                completion([
                    "refreshed": true,
                    "days": validDays,
                    "sevenDayAverageMinutes":
                        object["averageMinutes"] ?? 0,
                    "sevenDayCount":
                        object["dayCount"] ?? validDays.count,
                    "updatedAt": updatedText
                ])
                return
            }
        }

        guard attemptsRemaining > 0 else {
            completion(nil)
            return
        }

        DispatchQueue.main.asyncAfter(
            deadline: .now() + 0.25
        ) {
            self.waitForSevenDaySummary(
                newerThan: startedAt,
                attemptsRemaining:
                    attemptsRemaining - 1,
                completion: completion
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


private struct IOSSevenDayReportContainer: View {
    let context: DeviceActivityReport.Context
    let filter: DeviceActivityFilter
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            DeviceActivityReport(context, filter: filter)
                .navigationTitle("七日平均屏时")
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
    static let selectionKey =
        "snowball.monitor.mini.singleAppSelection.v1"
    static let selectionSavedAtKey =
        "snowball.monitor.mini.singleAppSelectionSavedAt.v1"

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
