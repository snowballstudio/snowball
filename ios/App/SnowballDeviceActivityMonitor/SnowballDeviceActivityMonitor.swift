import Foundation
import DeviceActivity

/// 这个类必须属于 Device Activity Monitor Extension Target，
/// 不能放进雪球主 App Target。
final class SnowballDeviceActivityMonitor: DeviceActivityMonitor {
    private let appGroup = "group.com.snowball.health"
    private let cacheKey = "snowball.offscreen.monitor.records.v1"

    override func eventDidReachThreshold(
        _ event: DeviceActivityEvent.Name,
        activity: DeviceActivityName
    ) {
        super.eventDidReachThreshold(event, activity: activity)

        let now = Date()
        let calendar = Calendar.autoupdatingCurrent
        let eventText = event.rawValue
        let thresholdMinutes = parseThresholdMinutes(eventText)

        // 00:00–05:00 的活动归到前一天晚上。
        let hour = calendar.component(.hour, from: now)
        let owningDate: Date
        if hour < 5 {
            owningDate = calendar.date(
                byAdding: .day,
                value: -1,
                to: now
            ) ?? now
        } else {
            owningDate = now
        }

        let dateText = formatDate(owningDate)
        let timeText = formatTime(now)
        let timestamp = ISO8601DateFormatter().string(from: now)

        guard let defaults = UserDefaults(suiteName: appGroup) else {
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
            // 只保留该晚最新一次回调。
            records[index] = newRecord
        } else {
            records.append(newRecord)
        }

        records.sort {
            ($0["date"] as? String ?? "")
                > ($1["date"] as? String ?? "")
        }

        // 测试阶段最多保留最近31晚，避免共享容器无限增长。
        if records.count > 31 {
            records = Array(records.prefix(31))
        }

        if let data = try? JSONSerialization.data(
            withJSONObject: records
        ) {
            defaults.set(data, forKey: cacheKey)
            defaults.set(timestamp, forKey: "snowball.offscreen.monitor.lastCallbackAt")
        }
    }

    private func readRecords(
        _ defaults: UserDefaults
    ) -> [[String: Any]] {
        guard let data = defaults.data(forKey: cacheKey),
              let object = try? JSONSerialization.jsonObject(
                with: data
              ),
              let records = object as? [[String: Any]]
        else {
            return []
        }
        return records
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
