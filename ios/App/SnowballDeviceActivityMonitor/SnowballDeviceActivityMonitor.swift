import Foundation
import DeviceActivity
import OSLog

/// 这个类必须属于 Device Activity Monitor Extension Target，
/// 不能放进雪球主 App Target。
final class SnowballDeviceActivityMonitor: DeviceActivityMonitor {
    private let appGroup = "group.com.snowball.health"
    private let cacheKey = "snowball.offscreen.monitor.records.v1"
    private let debugKey = "snowball.offscreen.monitor.debug.v1"

    private let logger = Logger(
        subsystem: "com.snowball.health.SnowballDeviceActivityMonitor",
        category: "Monitor"
    )

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        logAndSaveDebug(kind: "intervalDidStart", activity: activity, event: nil)
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        logAndSaveDebug(kind: "intervalDidEnd", activity: activity, event: nil)
    }

    override func intervalWillStartWarning(for activity: DeviceActivityName) {
        super.intervalWillStartWarning(for: activity)
        logAndSaveDebug(kind: "intervalWillStartWarning", activity: activity, event: nil)
    }

    override func intervalWillEndWarning(for activity: DeviceActivityName) {
        super.intervalWillEndWarning(for: activity)
        logAndSaveDebug(kind: "intervalWillEndWarning", activity: activity, event: nil)
    }

    override func eventWillReachThresholdWarning(
        _ event: DeviceActivityEvent.Name,
        activity: DeviceActivityName
    ) {
        super.eventWillReachThresholdWarning(event, activity: activity)
        logAndSaveDebug(
            kind: "eventWillReachThresholdWarning",
            activity: activity,
            event: event
        )
    }

    override func eventDidReachThreshold(
        _ event: DeviceActivityEvent.Name,
        activity: DeviceActivityName
    ) {
        super.eventDidReachThreshold(event, activity: activity)

        logAndSaveDebug(
            kind: "eventDidReachThreshold",
            activity: activity,
            event: event
        )

        let now = Date()
        let calendar = Calendar.autoupdatingCurrent
        let eventText = event.rawValue
        let thresholdMinutes = parseThresholdMinutes(eventText)

        let hour = calendar.component(.hour, from: now)
        let owningDate: Date
        if hour < 5 {
            owningDate = calendar.date(byAdding: .day, value: -1, to: now) ?? now
        } else {
            owningDate = now
        }

        let dateText = formatDate(owningDate)
        let timeText = formatTime(now)
        let timestamp = ISO8601DateFormatter().string(from: now)

        guard let defaults = UserDefaults(suiteName: appGroup) else {
            logger.error("SNOWBALL_MONITOR: 无法打开 App Group \(self.appGroup, privacy: .public)")
            return
        }

        var records = readRecords(defaults)

        let newRecord: [String: Any] = [
            "id": "ios-monitor-\(dateText)",
            "date": dateText,
            "calculatedOffscreenTime": timeText,
            "dataSource": "Apple DeviceActivityMonitor（测试）",
            "androidOffscreenTime": "",
            "iosLastLongActivityEnd": timeText,
            "iosLastHourFirstPickupTime": "",
            "iosLastPickupTime": "",
            "iosLastHourActivityMinutes": thresholdMinutes,
            "iosGoodNightTime": "",
            "iosCalculatedOffscreenTime": timeText,
            "activityName": activity.rawValue,
            "eventName": eventText,
            "thresholdMinutes": thresholdMinutes,
            "callbackAt": timestamp
        ]

        if let index = records.firstIndex(where: {
            ($0["date"] as? String) == dateText
        }) {
            records[index] = newRecord
        } else {
            records.append(newRecord)
        }

        records.sort {
            ($0["date"] as? String ?? "") > ($1["date"] as? String ?? "")
        }

        if records.count > 31 {
            records = Array(records.prefix(31))
        }

        guard let data = try? JSONSerialization.data(withJSONObject: records) else {
            logger.error("SNOWBALL_MONITOR: records JSON 生成失败")
            return
        }

        defaults.set(data, forKey: cacheKey)
        defaults.set(timestamp, forKey: "snowball.offscreen.monitor.lastCallbackAt")

        if defaults.data(forKey: cacheKey) != nil {
            logger.notice(
                "SNOWBALL_MONITOR: 阈值记录写入并立即读回成功；activity=\(activity.rawValue, privacy: .public)，event=\(eventText, privacy: .public)，threshold=\(thresholdMinutes, privacy: .public)"
            )
        } else {
            logger.error("SNOWBALL_MONITOR: 阈值记录写入后读回为空")
        }
    }

    private func logAndSaveDebug(
        kind: String,
        activity: DeviceActivityName,
        event: DeviceActivityEvent.Name?
    ) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let eventName = event?.rawValue ?? ""

        logger.notice(
            "SNOWBALL_MONITOR: callback=\(kind, privacy: .public)，activity=\(activity.rawValue, privacy: .public)，event=\(eventName, privacy: .public)，at=\(timestamp, privacy: .public)"
        )

        guard let defaults = UserDefaults(suiteName: appGroup) else {
            logger.error("SNOWBALL_MONITOR: Debug 无法打开 App Group \(self.appGroup, privacy: .public)")
            return
        }

        var logs = readDebugLogs(defaults)
        logs.insert([
            "kind": kind,
            "activityName": activity.rawValue,
            "eventName": eventName,
            "timestamp": timestamp
        ], at: 0)

        if logs.count > 100 {
            logs = Array(logs.prefix(100))
        }

        guard let data = try? JSONSerialization.data(withJSONObject: logs) else {
            logger.error("SNOWBALL_MONITOR: Debug JSON 生成失败")
            return
        }

        defaults.set(data, forKey: debugKey)
        defaults.set(timestamp, forKey: "snowball.offscreen.monitor.lastCallbackAt")
        defaults.set(kind, forKey: "snowball.offscreen.monitor.lastCallbackKind")
        defaults.set(activity.rawValue, forKey: "snowball.offscreen.monitor.lastActivityName")
        defaults.set(eventName, forKey: "snowball.offscreen.monitor.lastEventName")

        if defaults.data(forKey: debugKey) != nil {
            logger.notice("SNOWBALL_MONITOR: Debug 日志写入并立即读回成功")
        } else {
            logger.error("SNOWBALL_MONITOR: Debug 日志写入后读回为空")
        }
    }

    private func readRecords(_ defaults: UserDefaults) -> [[String: Any]] {
        guard let data = defaults.data(forKey: cacheKey),
              let object = try? JSONSerialization.jsonObject(with: data),
              let records = object as? [[String: Any]]
        else {
            return []
        }
        return records
    }

    private func readDebugLogs(_ defaults: UserDefaults) -> [[String: Any]] {
        guard let data = defaults.data(forKey: debugKey),
              let object = try? JSONSerialization.jsonObject(with: data),
              let logs = object as? [[String: Any]]
        else {
            return []
        }
        return logs
    }

    private func parseThresholdMinutes(_ eventName: String) -> Int {
        guard let finalPart = eventName.split(separator: ".").last else {
            return 0
        }
        return Int(finalPart) ?? 0
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = Calendar.autoupdatingCurrent.timeZone
        formatter.dateFormat = "yyyy/M/d"
        return formatter.string(from: date)
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = Calendar.autoupdatingCurrent.timeZone
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}
