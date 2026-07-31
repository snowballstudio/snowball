import DeviceActivity
import Foundation
import OSLog

final class SnowballDeviceActivityMonitor: DeviceActivityMonitor {
    private let appGroup = "group.com.snowball.health"
    private let miniActivity =
        DeviceActivityName("snowball.monitor.mini.v1")
    private let miniCallbackLogKey =
        "snowball.monitor.mini.callbacks.v1"

    // 保留正式离机监控原有缓存键，避免未来恢复正式算法时丢失兼容性。
    private let productionCacheKey =
        "snowball.offscreen.monitor.records.v1"

    private let logger = Logger(
        subsystem: "com.snowball.health.SnowballDeviceActivityMonitor",
        category: "Monitor"
    )

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        recordCallback(
            kind: "intervalDidStart",
            activity: activity,
            event: nil
        )
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        recordCallback(
            kind: "intervalDidEnd",
            activity: activity,
            event: nil
        )
    }

    override func intervalWillStartWarning(
        for activity: DeviceActivityName
    ) {
        super.intervalWillStartWarning(for: activity)
        recordCallback(
            kind: "intervalWillStartWarning",
            activity: activity,
            event: nil
        )
    }

    override func intervalWillEndWarning(
        for activity: DeviceActivityName
    ) {
        super.intervalWillEndWarning(for: activity)
        recordCallback(
            kind: "intervalWillEndWarning",
            activity: activity,
            event: nil
        )
    }

    override func eventWillReachThresholdWarning(
        _ event: DeviceActivityEvent.Name,
        activity: DeviceActivityName
    ) {
        super.eventWillReachThresholdWarning(event, activity: activity)
        recordCallback(
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

        recordCallback(
            kind: "eventDidReachThreshold",
            activity: activity,
            event: event
        )

        // 最小测试只负责证明系统回调；正式三组监控仍保留兼容记录。
        guard activity != miniActivity else { return }
        saveProductionThresholdRecord(
            event: event,
            activity: activity
        )
    }

    private func recordCallback(
        kind: String,
        activity: DeviceActivityName,
        event: DeviceActivityEvent.Name?
    ) {
        let now = Date()
        let timestamp = ISO8601DateFormatter().string(from: now)
        let eventName = event?.rawValue ?? ""

        logger.notice(
            "SNOWBALL_MONITOR callback=\(kind, privacy: .public), activity=\(activity.rawValue, privacy: .public), event=\(eventName, privacy: .public)"
        )

        guard let defaults = UserDefaults(suiteName: appGroup) else {
            logger.error("SNOWBALL_MONITOR 无法打开App Group")
            return
        }

        var callbacks: [[String: Any]] = []
        if let oldData = defaults.data(forKey: miniCallbackLogKey),
           let object = try? JSONSerialization.jsonObject(with: oldData),
           let oldCallbacks = object as? [[String: Any]] {
            callbacks = oldCallbacks
        }

        callbacks.insert([
            "kind": kind,
            "activityName": activity.rawValue,
            "eventName": eventName,
            "timestamp": timestamp,
            "isMiniTest": activity == miniActivity
        ], at: 0)

        if callbacks.count > 100 {
            callbacks = Array(callbacks.prefix(100))
        }

        guard let data = try? JSONSerialization.data(
            withJSONObject: callbacks
        ) else {
            logger.error("SNOWBALL_MONITOR 回调JSON生成失败")
            return
        }

        defaults.set(data, forKey: miniCallbackLogKey)
        defaults.set(
            timestamp,
            forKey: "snowball.monitor.mini.lastCallbackAt"
        )
        defaults.set(
            kind,
            forKey: "snowball.monitor.mini.lastCallbackKind"
        )
    }

    private func saveProductionThresholdRecord(
        event: DeviceActivityEvent.Name,
        activity: DeviceActivityName
    ) {
        let now = Date()
        let calendar = Calendar.autoupdatingCurrent
        let hour = calendar.component(.hour, from: now)
        let owningDate = hour < 5
            ? calendar.date(byAdding: .day, value: -1, to: now) ?? now
            : now

        let dateText = formatDate(owningDate)
        let timeText = formatTime(now)
        let eventText = event.rawValue
        let thresholdMinutes = parseThresholdMinutes(eventText)

        guard let defaults = UserDefaults(suiteName: appGroup) else {
            return
        }

        var records: [[String: Any]] = []
        if let oldData = defaults.data(forKey: productionCacheKey),
           let object = try? JSONSerialization.jsonObject(with: oldData),
           let oldRecords = object as? [[String: Any]] {
            records = oldRecords
        }

        let record: [String: Any] = [
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
            "callbackAt": ISO8601DateFormatter().string(from: now)
        ]

        if let index = records.firstIndex(where: {
            ($0["date"] as? String) == dateText
        }) {
            records[index] = record
        } else {
            records.append(record)
        }

        if records.count > 31 {
            records = Array(records.suffix(31))
        }

        if let data = try? JSONSerialization.data(
            withJSONObject: records
        ) {
            defaults.set(data, forKey: productionCacheKey)
        }
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
