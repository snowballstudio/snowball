import Foundation
import Capacitor
import DeviceActivity
import FamilyControls
import SwiftUI
import UIKit

@objc(IOSScreenTimePlugin)
public class IOSScreenTimePlugin: CAPPlugin, CAPBridgedPlugin {
    private var homeMiniHost: UIViewController?


    public let identifier = "IOSScreenTimePlugin"
    public let jsName = "IOSScreenTime"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentReport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentSevenDayReport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentSevenDayDailyTable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showHomeMiniReport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideHomeMiniReport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentDashboardReport", returnType: CAPPluginReturnPromise),
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
            segment: .hourly(
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


    @objc public func presentSevenDayDailyTable(
        _ call: CAPPluginCall
    ) {
        guard AuthorizationCenter.shared.authorizationStatus
                == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        let calendar = Calendar.autoupdatingCurrent
        let logicalToday = snowballDayStart(for: Date(), calendar: calendar)

        guard
            let firstDay = calendar.date(
                byAdding: .day,
                value: -29,
                to: logicalToday
            ),
            let dayAfterToday = calendar.date(
                byAdding: .day,
                value: 1,
                to: logicalToday
            )
        else {
            call.reject("无法计算30日屏幕时间区间。")
            return
        }

        let start = snowballBoundary(for: firstDay, calendar: calendar)
        let end = snowballBoundary(for: dayAfterToday, calendar: calendar)

        let filter = DeviceActivityFilter(
            segment: .hourly(
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
                "Snowball Seven Day Daily Table"
            )
            let reportView = IOSSevenDayDailyTableContainer(
                context: context,
                filter: filter,
                onClose: {
                    presenter.dismiss(animated: true) {
                        call.resolve([
                            "closed": true,
                            "returnedHome": true,
                            "startDate":
                                self.formatSnowballDate(start),
                            "endDate":
                                self.formatSnowballDate(logicalToday)
                        ])
                    }
                },
                onOpenDashboard: {
                    presenter.dismiss(animated: false) {
                        self.removeHomeMiniHost()

                        let dashboard = IOSScreenTimeDashboardContainer(
                            onClose: {
                                presenter.dismiss(animated: true) {
                                    call.resolve([
                                        "closed": true,
                                        "returnedHome": true,
                                        "openedDashboard": true
                                    ])
                                }
                            }
                        )
                        let dashboardHost = UIHostingController(
                            rootView: dashboard
                        )
                        dashboardHost.modalPresentationStyle = .fullScreen
                        presenter.present(dashboardHost, animated: false)
                    }
                }
            )

            let host = UIHostingController(rootView: reportView)
            host.modalPresentationStyle = .fullScreen
            presenter.present(host, animated: true)
        }
    }


    // MARK: - Snowball 离机时间 Monitor 测试

    @objc public func showHomeMiniReport(_ call: CAPPluginCall) {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        let x = call.getDouble("x") ?? 0
        let y = call.getDouble("y") ?? 0
        let width = max(40, call.getDouble("width") ?? 180)
        let height = max(20, call.getDouble("height") ?? 26)

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
                bySettingHour: 5,
                minute: 0,
                second: 0,
                of: today
            )
        else {
            call.reject("无法计算主页迷你报表区间。")
            return
        }

        let filter = DeviceActivityFilter(
            segment: .hourly(
                during: DateInterval(start: start, end: end)
            ),
            users: .all,
            devices: .all
        )

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("找不到雪球主页面。")
                return
            }

            guard let webView = self.bridge?.webView else {
                call.reject("找不到雪球网页视图。")
                return
            }

            self.removeHomeMiniHost()

            let report = DeviceActivityReport(
                DeviceActivityReport.Context("Snowball Home Mini"),
                filter: filter
            )
            .background(Color.clear)

            let host = UIHostingController(rootView: report)
            host.view.backgroundColor = .clear
            host.view.isOpaque = false
            host.view.isUserInteractionEnabled = false

            /*
             Home.jsx 传入的是 homeIOSMiniReportSlot 的最终
             getBoundingClientRect() 坐标。槽位本身已经位于雪地图
             左 6%、上 6%，因此这里不再重复叠加 Safe Area、
             adjustedContentInset 或其它偏移。
            */
            host.view.frame = CGRect(
                x: x,
                y: y,
                width: width,
                height: height
            )
            host.view.autoresizingMask = []

            presenter.addChild(host)
            webView.addSubview(host.view)
            host.didMove(toParent: presenter)
            self.homeMiniHost = host

            call.resolve([
                "shown": true,
                "coordinateSpace": "finalSlotViewportRect",
                "frameX": x,
                "frameY": y,
                "frameWidth": width,
                "frameHeight": height
            ])
        }
    }

    @objc public func hideHomeMiniReport(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.removeHomeMiniHost()
            call.resolve(["hidden": true])
        }
    }

    @objc public func presentDashboardReport(_ call: CAPPluginCall) {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("找不到雪球主页面。")
                return
            }

            // Dashboard 与主页 Mini Report 都属于 DeviceActivityReport。
            // 呈现汇总表前必须先释放 Mini Report，避免系统同时生成两份报告而卡在加载中。
            self.removeHomeMiniHost()

            let dashboard = IOSScreenTimeDashboardContainer(
                onClose: {
                    presenter.dismiss(animated: true) {
                        call.resolve(["closed": true])
                    }
                }
            )

            let host = UIHostingController(rootView: dashboard)
            host.modalPresentationStyle = .fullScreen
            presenter.present(host, animated: true)
        }
    }

    private func snowballDayStart(
        for date: Date,
        calendar: Calendar = .autoupdatingCurrent
    ) -> Date {
        let calendarDay = calendar.startOfDay(for: date)
        let hour = calendar.component(.hour, from: date)
        if hour < 5 {
            return calendar.date(
                byAdding: .day,
                value: -1,
                to: calendarDay
            ) ?? calendarDay
        }
        return calendarDay
    }

    private func snowballBoundary(
        for day: Date,
        calendar: Calendar = .autoupdatingCurrent
    ) -> Date {
        calendar.date(
            bySettingHour: 5,
            minute: 0,
            second: 0,
            of: calendar.startOfDay(for: day)
        ) ?? calendar.startOfDay(for: day)
    }

    private func removeHomeMiniHost() {
        guard let host = homeMiniHost else {
            return
        }
        host.willMove(toParent: nil)
        host.view.removeFromSuperview()
        host.removeFromParent()
        homeMiniHost = nil
    }


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


private struct IOSSevenDayDailyTableContainer: View {
    let context: DeviceActivityReport.Context
    let filter: DeviceActivityFilter
    let onClose: () -> Void
    let onOpenDashboard: () -> Void

    private enum Page {
        case table
        case detail
    }

    @State private var page: Page = .table
    @State private var selectedDate: Date = {
        let calendar = Calendar.autoupdatingCurrent
        let today = calendar.startOfDay(for: Date())
        return calendar.date(byAdding: .day, value: -1, to: today) ?? today
    }()

    private var detailDateRange: ClosedRange<Date> {
        let calendar = Calendar.autoupdatingCurrent
        let today = calendar.startOfDay(for: Date())
        let yesterday = calendar.date(byAdding: .day, value: -1, to: today) ?? today
        let start = calendar.date(byAdding: .day, value: -29, to: yesterday) ?? yesterday
        return start...yesterday
    }

    private var detailFilter: DeviceActivityFilter {
        let calendar = Calendar.autoupdatingCurrent
        let start = calendar.startOfDay(for: selectedDate)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? Date()
        return DeviceActivityFilter(
            segment: .hourly(during: DateInterval(start: start, end: end)),
            users: .all,
            devices: .all
        )
    }

    private var detailTitle: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M月d日"
        return formatter.string(from: selectedDate)
    }

    var body: some View {
        NavigationStack {
            Group {
                switch page {
                case .table:
                    VStack(spacing: 0) {
                        HStack(spacing: 8) {
                            Text("查看某日详情")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(.secondary)

                            DatePicker(
                                "",
                                selection: $selectedDate,
                                in: detailDateRange,
                                displayedComponents: .date
                            )
                            .labelsHidden()
                            .datePickerStyle(.compact)
                            .font(.system(size: 11))

                            Button("查看") {
                                page = .detail
                            }
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(
                                Color(red: 0.72, green: 0.55, blue: 0.18)
                            )
                            .buttonStyle(.plain)

                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color(uiColor: .secondarySystemBackground))

                        DeviceActivityReport(context, filter: filter)
                            .frame(
                                maxWidth: .infinity,
                                maxHeight: .infinity
                            )
                    }
                    .background(
                        snowballScreenTimeGradient
                            .ignoresSafeArea()
                    )
                    .navigationTitle("30日屏幕时间")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button(action: onClose) {
                                Text("‹")
                                    .font(.system(size: 30, weight: .regular))
                                    .foregroundStyle(Color.primary.opacity(0.82))
                                    .frame(width: 34, height: 34)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("返回主页")
                        }

                        ToolbarItem(placement: .topBarTrailing) {
                            Button(action: onOpenDashboard) {
                                Text("查看报表")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(
                                        Color(red: 0.72, green: 0.55, blue: 0.18)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }

                case .detail:
                    DeviceActivityReport(
                        DeviceActivityReport.Context("Total Activity"),
                        filter: detailFilter
                    )
                    .id(selectedDate)
                    .navigationTitle(detailTitle)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button {
                                page = .table
                            } label: {
                                Text("‹")
                                    .font(.system(size: 30, weight: .regular))
                                    .foregroundStyle(Color.primary.opacity(0.82))
                                    .frame(width: 34, height: 34)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("返回30日列表")
                        }
                    }
                }
            }
        }
    }
}

private enum IOSDashboardRange: String, CaseIterable, Identifiable {
    case today
    case yesterday
    case week
    case previousWeek
    case month

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: return "今天"
        case .yesterday: return "昨天"
        case .week: return "周均"
        case .previousWeek: return "前周"
        case .month: return "月均"
        }
    }

    var context: DeviceActivityReport.Context {
        switch self {
        case .today:
            return DeviceActivityReport.Context(
                "Snowball Dashboard Today"
            )
        case .yesterday:
            return DeviceActivityReport.Context(
                "Snowball Dashboard Yesterday"
            )
        case .week:
            return DeviceActivityReport.Context(
                "Snowball Dashboard Week"
            )
        case .previousWeek:
            return DeviceActivityReport.Context(
                "Snowball Dashboard Previous Week"
            )
        case .month:
            return DeviceActivityReport.Context(
                "Snowball Dashboard Month"
            )
        }
    }
}

private func snowballLogicalDay(
    for date: Date,
    calendar: Calendar = .autoupdatingCurrent
) -> Date {
    let day = calendar.startOfDay(for: date)
    if calendar.component(.hour, from: date) < 5 {
        return calendar.date(byAdding: .day, value: -1, to: day) ?? day
    }
    return day
}

private func snowballFiveAM(
    for day: Date,
    calendar: Calendar = .autoupdatingCurrent
) -> Date {
    calendar.date(
        bySettingHour: 5,
        minute: 0,
        second: 0,
        of: calendar.startOfDay(for: day)
    ) ?? calendar.startOfDay(for: day)
}

private var snowballScreenTimeGradient: LinearGradient {
    LinearGradient(
        colors: [
            Color(red: 0.91, green: 0.96, blue: 0.98),
            Color(red: 0.84, green: 0.91, blue: 0.95),
            Color(red: 0.90, green: 0.93, blue: 0.95)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

struct IOSScreenTimeDashboardContainer: View {
    let onClose: () -> Void

    private enum Page {
        case dashboard
        case help
        case dailyTable
        case dayDetail
    }

    @State private var range: IOSDashboardRange = .yesterday
    @State private var page: Page = .dashboard
    @State private var selectedDetailDate: Date = {
        let calendar = Calendar.autoupdatingCurrent
        let today = calendar.startOfDay(for: Date())
        return calendar.date(
            byAdding: .day,
            value: -1,
            to: today
        ) ?? today
    }()

    private var filter: DeviceActivityFilter {
        let calendar = Calendar.autoupdatingCurrent
        let today = calendar.startOfDay(for: Date())

        switch range {
        case .today:
            let end = calendar.date(
                byAdding: .day,
                value: 1,
                to: today
            ) ?? Date()
            return DeviceActivityFilter(
                segment: .hourly(
                    during: DateInterval(start: today, end: end)
                ),
                users: .all,
                devices: .all
            )

        case .yesterday:
            let start = calendar.date(
                byAdding: .day,
                value: -1,
                to: today
            ) ?? today
            return DeviceActivityFilter(
                segment: .hourly(
                    during: DateInterval(start: start, end: today)
                ),
                users: .all,
                devices: .all
            )

        case .week:
            let start = calendar.date(
                byAdding: .day,
                value: -7,
                to: today
            ) ?? today
            return DeviceActivityFilter(
                segment: .daily(
                    during: DateInterval(start: start, end: today)
                ),
                users: .all,
                devices: .all
            )

        case .previousWeek:
            let start = calendar.date(
                byAdding: .day,
                value: -14,
                to: today
            ) ?? today
            let end = calendar.date(
                byAdding: .day,
                value: -7,
                to: today
            ) ?? today
            return DeviceActivityFilter(
                segment: .daily(
                    during: DateInterval(start: start, end: end)
                ),
                users: .all,
                devices: .all
            )

        case .month:
            let start = calendar.date(
                byAdding: .day,
                value: -30,
                to: today
            ) ?? today
            return DeviceActivityFilter(
                segment: .daily(
                    during: DateInterval(start: start, end: today)
                ),
                users: .all,
                devices: .all
            )
        }
    }

    private var dailyTableFilter: DeviceActivityFilter {
        let calendar = Calendar.autoupdatingCurrent
        let logicalToday = snowballLogicalDay(for: Date(), calendar: calendar)
        let firstDay = calendar.date(
            byAdding: .day,
            value: -29,
            to: logicalToday
        ) ?? logicalToday
        let nextDay = calendar.date(
            byAdding: .day,
            value: 1,
            to: logicalToday
        ) ?? logicalToday

        return DeviceActivityFilter(
            segment: .hourly(
                during: DateInterval(
                    start: snowballFiveAM(for: firstDay, calendar: calendar),
                    end: snowballFiveAM(for: nextDay, calendar: calendar)
                )
            ),
            users: .all,
            devices: .all
        )
    }

    private var dayDetailFilter: DeviceActivityFilter {
        let calendar = Calendar.autoupdatingCurrent
        let logicalDay = calendar.startOfDay(for: selectedDetailDate)
        let nextDay = calendar.date(
            byAdding: .day,
            value: 1,
            to: logicalDay
        ) ?? logicalDay
        let start = snowballFiveAM(for: logicalDay, calendar: calendar)
        let end = snowballFiveAM(for: nextDay, calendar: calendar)

        return DeviceActivityFilter(
            segment: .hourly(
                during: DateInterval(start: start, end: end)
            ),
            users: .all,
            devices: .all
        )
    }

    private var detailDateRange: ClosedRange<Date> {
        let calendar = Calendar.autoupdatingCurrent
        let logicalToday = snowballLogicalDay(for: Date(), calendar: calendar)
        let start = calendar.date(
            byAdding: .day,
            value: -29,
            to: logicalToday
        ) ?? logicalToday
        return start...logicalToday
    }

    private var detailDateTitle: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M月d日"
        return formatter.string(from: selectedDetailDate)
    }

    var body: some View {
        NavigationStack {
            Group {
                switch page {
                case .dashboard:
                    VStack(spacing: 0) {
                        Picker("统计范围", selection: $range) {
                            ForEach(
                                IOSDashboardRange.allCases
                            ) { item in
                                Text(item.title).tag(item)
                            }
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, 14)
                        .padding(.top, 10)
                        .padding(.bottom, 4)

                        /*
                         恢复到加入背景图以前的简单结构。
                         DeviceActivityReport 直接占据 Picker 下方空间，
                         不再经过背景 ZStack、半透明覆盖层或 clipped。
                        */
                        ZStack(alignment: .topTrailing) {
                            DeviceActivityReport(
                                range.context,
                                filter: filter
                            )
                            .id(range)
                            .frame(
                                maxWidth: .infinity,
                                maxHeight: .infinity
                            )

                            Button {
                                page = .dailyTable
                            } label: {
                                Text("查看详情")
                                    .font(
                                        .system(
                                            size: 12,
                                            weight: .semibold
                                        )
                                    )
                                    .foregroundStyle(
                                        Color(
                                            red: 0.72,
                                            green: 0.55,
                                            blue: 0.18
                                        )
                                    )
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 8)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 18)
                            .padding(.trailing, 18)
                            .zIndex(10)
                        }
                        .frame(
                            maxWidth: .infinity,
                            maxHeight: .infinity
                        )
                    }
                    .frame(
                        maxWidth: .infinity,
                        maxHeight: .infinity
                    )
                    .background(
                        snowballScreenTimeGradient
                            .ignoresSafeArea()
                    )
                    .navigationTitle("苹果屏幕时间")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(
                            placement: .topBarLeading
                        ) {
                            Button(action: onClose) {
                                Text("‹")
                                    .font(
                                        .system(
                                            size: 30,
                                            weight: .regular
                                        )
                                    )
                                    .foregroundStyle(
                                        Color.primary.opacity(0.82)
                                    )
                                    .frame(width: 34, height: 34)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("返回")
                        }

                        ToolbarItem(
                            placement: .topBarTrailing
                        ) {
                            Button {
                                page = .help
                            } label: {
                                Text("说明")
                                    .font(
                                        .system(
                                            size: 12,
                                            weight: .medium
                                        )
                                    )
                                    .foregroundStyle(
                                        Color.primary.opacity(0.62)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }

                case .help:
                    IOSScreenTimeHelpView {
                        page = .dashboard
                    }
                    .navigationTitle("苹果屏幕时间说明")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(
                            placement: .topBarLeading
                        ) {
                            Button {
                                page = .dashboard
                            } label: {
                                Text("‹")
                                    .font(
                                        .system(
                                            size: 30,
                                            weight: .regular
                                        )
                                    )
                                    .foregroundStyle(
                                        Color.primary.opacity(0.82)
                                    )
                                    .frame(width: 34, height: 34)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("返回报表")
                        }
                    }

                case .dailyTable:
                    VStack(spacing: 0) {
                        HStack(spacing: 10) {
                            Text("查看某日详情")
                                .font(
                                    .system(
                                        size: 12,
                                        weight: .medium
                                    )
                                )
                                .foregroundStyle(.secondary)

                            DatePicker(
                                "",
                                selection: $selectedDetailDate,
                                in: detailDateRange,
                                displayedComponents: .date
                            )
                            .labelsHidden()
                            .datePickerStyle(.compact)
                            .font(.system(size: 11))

                            Button("查看") {
                                page = .dayDetail
                            }
                            .font(
                                .system(
                                    size: 12,
                                    weight: .semibold
                                )
                            )
                            .foregroundStyle(
                                Color(
                                    red: 0.72,
                                    green: 0.55,
                                    blue: 0.18
                                )
                            )
                            .buttonStyle(.plain)

                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(
                            Color(
                                uiColor:
                                    .secondarySystemBackground
                            )
                        )

                        DeviceActivityReport(
                            DeviceActivityReport.Context(
                                "Snowball Seven Day Daily Table"
                            ),
                            filter: dailyTableFilter
                        )
                        .frame(
                            maxWidth: .infinity,
                            maxHeight: .infinity
                        )
                    }
                    .background(
                        snowballScreenTimeGradient
                            .ignoresSafeArea()
                    )
                    .navigationTitle("30日屏幕时间")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(
                            placement: .topBarLeading
                        ) {
                            Button(action: onClose) {
                                Text("‹")
                                    .font(
                                        .system(
                                            size: 30,
                                            weight: .regular
                                        )
                                    )
                                    .foregroundStyle(
                                        Color.primary.opacity(0.82)
                                    )
                                    .frame(width: 34, height: 34)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("返回主页")
                        }

                        ToolbarItem(
                            placement: .topBarTrailing
                        ) {
                            Button {
                                page = .dashboard
                            } label: {
                                Text("查看报表")
                                    .font(
                                        .system(
                                            size: 12,
                                            weight: .semibold
                                        )
                                    )
                                    .foregroundStyle(
                                        Color(
                                            red: 0.72,
                                            green: 0.55,
                                            blue: 0.18
                                        )
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }

                case .dayDetail:
                    DeviceActivityReport(
                        DeviceActivityReport.Context(
                            "Total Activity"
                        ),
                        filter: dayDetailFilter
                    )
                    .id(selectedDetailDate)
                    .navigationTitle(
                        "\(detailDateTitle)屏幕时间"
                    )
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(
                            placement: .topBarLeading
                        ) {
                            Button {
                                page = .dailyTable
                            } label: {
                                Text("‹")
                                    .font(
                                        .system(
                                            size: 30,
                                            weight: .regular
                                        )
                                    )
                                    .foregroundStyle(
                                        Color.primary.opacity(0.82)
                                    )
                                    .frame(width: 34, height: 34)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("返回30日列表")
                        }
                    }
                }
            }
        }
    }
}



private struct IOSScreenTimeHelpView: View {
    let onBack: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(
                    "苹果屏幕时间来自 iPhone 系统提供的使用报告。报告可能需要短暂加载，也可能在刚打开页面时暂时空白，稍后重新进入通常会恢复。"
                )

                Text(
                    "“今天”和“昨天”显示对应自然日的使用情况；周均、前周和月均显示所选时间范围内的日平均值。系统报告存在延迟时，最近一天的数据可能稍后补充。"
                )

                Text(
                    "应用列表按使用时间排序，最多显示前十项。“其它”汇总未进入前十的应用。合计来自苹果返回的全部活动时间，因此有时会大于列表中可见项目的总和。"
                )

                Text(
                    "“打开”表示苹果记录的拿起或进入应用次数，仅用于观察使用频率。个别系统应用、网站和网页活动可能被苹果归入浏览器、其它类别，或者只计入合计，名称不一定与手机系统页面完全一致。"
                )

                Text(
                    "“类型分布”按照苹果返回的应用类别进行整理。分类由系统决定，仅用于粗略了解时间主要花在社交、创作、效率、系统或其它活动中的比例。"
                )

                Text(
                    "主页显示的“7日屏幕时间”是最近七个完整日期的平均值。“末次”根据系统最后一段明显活动估算，只表示主要手机活动大约结束的时间，不代表用户已经入睡或彻底离开手机。"
                )

                Text(
                    "休息时间还可以来自“道晚安”或通话记录。系统时间、道晚安时间和通话时间会进行比较，采用其中较晚的时间。用户也可以在日常数据中手动修改，手动记录用于补充或纠正系统推算。"
                )

                Text(
                    "苹果报告由系统生成，雪粒不能保证每次立即显示完整数据。遇到暂时空白、反复进入后消失或稍后重新出现，通常是系统报告仍在准备或刷新。"
                )

                Text(
                    "屏幕时间和休息记录仅用于个人生活回顾，不用于医学、睡眠或健康诊断。相关数据保存在设备本机，雪粒不会将完整的应用使用记录上传或公开。"
                )
            }
            .font(.system(size: 14))
            .foregroundStyle(Color.primary.opacity(0.88))
            .lineSpacing(5)
            .padding(.horizontal, 22)
            .padding(.top, 18)
            .padding(.bottom, 36)
        }
        .background(Color(uiColor: .systemBackground))
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
