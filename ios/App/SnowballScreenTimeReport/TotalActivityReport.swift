import DeviceActivity
import ExtensionKit
import Foundation
import ManagedSettings
import OSLog
import SwiftUI

extension DeviceActivityReport.Context {
    static let totalActivity = Self("Total Activity")
}

struct ScreenTimeApplicationRow: Identifiable, Hashable, Sendable {
    let id: String
    let segmentStart: Date
    let segmentEnd: Date
    let categoryName: String
    let displayName: String
    let bundleIdentifier: String
    let duration: TimeInterval
    let pickups: Int
    let notifications: Int
}

struct ScreenTimeSegmentRow: Identifiable, Hashable, Sendable {
    let id: String
    let start: Date
    let end: Date
    let duration: TimeInterval
    let firstPickup: Date?
    let longestStart: Date?
    let longestEnd: Date?
    let pickupsWithoutApplication: Int
}

struct ScreenTimeDeviceRow: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let model: String
    let lastUpdatedDate: Date
}

struct TotalActivityConfiguration: Sendable {
    let totalDuration: TimeInterval
    let segments: [ScreenTimeSegmentRow]
    let applications: [ScreenTimeApplicationRow]
    let devices: [ScreenTimeDeviceRow]
}


private enum SnowballScreenTimeSharedStore {
    private static let logger = Logger(
        subsystem: "com.snowball.health.SnowballScreenTimeReport",
        category: "SharedStore"
    )

    private static func diagnostic(_ message: String) {
        logger.notice("SNOWBALL_SCREEN_TIME: \(message, privacy: .public)")
    }

    static let appGroupIdentifier = "group.com.snowball.health"
    static let cacheKey = "snowball.ios-screen-time.days.v1"

    static func save(
        totalDuration: TimeInterval,
        segments: [ScreenTimeSegmentRow],
        applications: [ScreenTimeApplicationRow],
        devices: [ScreenTimeDeviceRow]
    ) {
        diagnostic("进入 save")
        diagnostic(
            "原始数据：totalDuration=\(totalDuration)秒，" +
            "segments=\(segments.count)，" +
            "applications=\(applications.count)，" +
            "devices=\(devices.count)"
        )

        guard let defaults = UserDefaults(
            suiteName: appGroupIdentifier
        ) else {
            diagnostic("失败：无法打开 App Group \(appGroupIdentifier)")
            return
        }

        diagnostic("成功：已打开 App Group \(appGroupIdentifier)")

        if let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        ) {
            diagnostic("App Group 容器路径：\(containerURL.path)")
        } else {
            diagnostic("失败：系统未返回 App Group 容器路径")
        }

        guard let reportDate = reportDate(
            segments: segments,
            applications: applications
        ) else {
            diagnostic("失败：没有可用于确定日期的数据")
            return
        }

        let dateText = dateFormatter.string(from: reportDate)
        diagnostic("报告日期：\(dateText)")

        var appBuckets: [String: [String: Any]] = [:]

        for row in applications {
            let key = row.bundleIdentifier + "|" + row.displayName
            var value = appBuckets[key] ?? [
                "realAppName": row.displayName,
                "packageName": row.bundleIdentifier,
                "categoryName": row.categoryName,
                "durationSeconds": 0.0,
                "pickups": 0,
                "notifications": 0
            ]

            value["durationSeconds"] =
                (value["durationSeconds"] as? Double ?? 0)
                + row.duration
            value["pickups"] =
                (value["pickups"] as? Int ?? 0)
                + row.pickups
            value["notifications"] =
                (value["notifications"] as? Int ?? 0)
                + row.notifications

            appBuckets[key] = value
        }

        let apps: [[String: Any]] = appBuckets.values
            .map { value in
                var result = value
                let seconds =
                    result["durationSeconds"] as? Double ?? 0
                result["minutes"] =
                    max(0, Int((seconds / 60.0).rounded()))
                return result
            }
            .sorted { left, right in
                let leftMinutes = left["minutes"] as? Int ?? 0
                let rightMinutes = right["minutes"] as? Int ?? 0

                if leftMinutes != rightMinutes {
                    return leftMinutes > rightMinutes
                }

                let leftName =
                    left["realAppName"] as? String ?? ""
                let rightName =
                    right["realAppName"] as? String ?? ""
                return leftName.localizedCompare(rightName)
                    == .orderedAscending
            }

        diagnostic(
            "APP 合并完成：原始 \(applications.count) 条，合并后 \(apps.count) 条"
        )

        let hourlyActivity: [[String: Any]] = segments.map { row in
            var item: [String: Any] = [
                "hourStart": isoFormatter.string(from: row.start),
                "hourEnd": isoFormatter.string(from: row.end),
                "activitySeconds":
                    max(0, Int(row.duration.rounded())),
                "pickupsWithoutApplication":
                    row.pickupsWithoutApplication
            ]

            if let firstPickup = row.firstPickup {
                item["firstPickupTime"] =
                    isoFormatter.string(from: firstPickup)
            }

            if let longestStart = row.longestStart,
               let longestEnd = row.longestEnd {
                item["longestActivityStartTime"] =
                    isoFormatter.string(from: longestStart)
                item["longestActivityEndTime"] =
                    isoFormatter.string(from: longestEnd)
                item["segments"] = [[
                    "startTime":
                        isoFormatter.string(from: longestStart),
                    "endTime":
                        isoFormatter.string(from: longestEnd)
                ]]
            }

            return item
        }

        let deviceRows: [[String: Any]] = devices.map { row in
            [
                "name": row.name,
                "model": row.model,
                "lastUpdatedDate":
                    isoFormatter.string(
                        from: row.lastUpdatedDate
                    )
            ]
        }

        let day: [String: Any] = [
            "date": dateText,
            "screenMinutes":
                max(0, Int((totalDuration / 60.0).rounded())),
            "totalActivitySeconds":
                max(0, Int(totalDuration.rounded())),
            "apps": apps,
            "hourlyActivity": hourlyActivity,
            "devices": deviceRows,
            "sourcePlatform": "ios",
            "generatedAt":
                isoFormatter.string(from: Date())
        ]

        var daysByDate: [String: [String: Any]] = [:]

        if let oldData = defaults.data(forKey: cacheKey) {
            diagnostic("发现旧缓存：\(oldData.count) 字节")

            if let oldObject = try? JSONSerialization.jsonObject(
                with: oldData
            ) as? [String: Any],
               let oldDays = oldObject["days"]
                    as? [[String: Any]] {
                for oldDay in oldDays {
                    if let oldDate = oldDay["date"] as? String {
                        daysByDate[oldDate] = oldDay
                    }
                }
                diagnostic("旧缓存解析成功：\(oldDays.count) 天")
            } else {
                diagnostic("警告：旧缓存无法解析，将覆盖重建")
            }
        } else {
            diagnostic("没有旧缓存，将创建第一条记录")
        }

        daysByDate[dateText] = day

        let sortedDays = daysByDate.values.sorted {
            ($0["date"] as? String ?? "")
                < ($1["date"] as? String ?? "")
        }

        let cache: [String: Any] = [
            "days": sortedDays,
            "updatedAt": isoFormatter.string(from: Date()),
            "version": 1
        ]

        guard JSONSerialization.isValidJSONObject(cache) else {
            diagnostic("失败：cache 不是有效 JSON 对象")
            return
        }

        guard let data = try? JSONSerialization.data(
            withJSONObject: cache
        ) else {
            diagnostic("失败：JSON 数据生成失败")
            return
        }

        diagnostic(
            "JSON 生成成功：\(data.count) 字节，\(sortedDays.count) 天"
        )

        defaults.set(data, forKey: cacheKey)
        let synchronized = defaults.synchronize()

        diagnostic("写入完成：synchronize=\(synchronized)")

        if let readBack = defaults.data(forKey: cacheKey) {
            diagnostic("立即读回成功：\(readBack.count) 字节")

            if let object = try? JSONSerialization.jsonObject(
                with: readBack
            ) as? [String: Any],
               let readBackDays = object["days"]
                    as? [[String: Any]] {
                diagnostic(
                    "立即读回解析成功：\(readBackDays.count) 天"
                )
            } else {
                diagnostic("失败：立即读回后 JSON 无法解析")
            }
        } else {
            diagnostic("失败：写入后立即读回为空")
        }
    }

    private static func reportDate(
        segments: [ScreenTimeSegmentRow],
        applications: [ScreenTimeApplicationRow]
    ) -> Date? {
        let earliestSegment = segments.map(\.start).min()
        let earliestApplication =
            applications.map(\.segmentStart).min()
        let source = earliestSegment ?? earliestApplication
        guard let source else { return nil }
        return Calendar.autoupdatingCurrent.startOfDay(
            for: source
        )
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone =
            Calendar.autoupdatingCurrent.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds
        ]
        return formatter
    }()
}

struct TotalActivityReport: DeviceActivityReportScene {
    private static let logger = Logger(
        subsystem: "com.snowball.health.SnowballScreenTimeReport",
        category: "ReportScene"
    )

    let context: DeviceActivityReport.Context = .totalActivity
    let content: (TotalActivityConfiguration) -> TotalActivityView

    func makeConfiguration(
        representing data: DeviceActivityResults<DeviceActivityData>
    ) async -> TotalActivityConfiguration {
        Self.logger.notice("SNOWBALL_SCREEN_TIME: makeConfiguration 开始")
        var totalDuration: TimeInterval = 0
        var segments: [ScreenTimeSegmentRow] = []
        var applications: [ScreenTimeApplicationRow] = []
        var devices: [ScreenTimeDeviceRow] = []

        for await deviceData in data {
            let deviceName = deviceData.device.name ?? "未命名设备"
            let deviceModel = String(describing: deviceData.device.model)
            let deviceID = deviceName + "-" + deviceModel

            devices.append(
                ScreenTimeDeviceRow(
                    id: deviceID,
                    name: deviceName,
                    model: deviceModel,
                    lastUpdatedDate: deviceData.lastUpdatedDate
                )
            )

            for await segment in deviceData.activitySegments {
                totalDuration += segment.totalActivityDuration

                let start = segment.dateInterval.start
                let end = segment.dateInterval.end
                let longest = segment.longestActivity

                let segmentID =
                    String(start.timeIntervalSince1970) +
                    "-" +
                    String(end.timeIntervalSince1970) +
                    "-" +
                    deviceID

                segments.append(
                    ScreenTimeSegmentRow(
                        id: segmentID,
                        start: start,
                        end: end,
                        duration: segment.totalActivityDuration,
                        firstPickup: segment.firstPickup,
                        longestStart: longest?.start,
                        longestEnd: longest?.end,
                        pickupsWithoutApplication:
                            segment.totalPickupsWithoutApplicationActivity
                    )
                )

                for await categoryActivity in segment.categories {
                    let rawCategoryName =
                        categoryActivity.category.localizedDisplayName
                    let categoryName =
                        rawCategoryName?.isEmpty == false
                        ? rawCategoryName!
                        : "其它"

                    for await applicationActivity
                        in categoryActivity.applications {
                        let application =
                            applicationActivity.application

                        let bundleIdentifier =
                            application.bundleIdentifier
                            ?? "Apple 未返回 Bundle ID"

                        let rawDisplayName =
                            application.localizedDisplayName

                        let displayName =
                            rawDisplayName?.isEmpty == false
                            ? rawDisplayName!
                            : bundleIdentifier

                        let rowID =
                            segmentID +
                            "|" +
                            categoryName +
                            "|" +
                            bundleIdentifier

                        applications.append(
                            ScreenTimeApplicationRow(
                                id: rowID,
                                segmentStart: start,
                                segmentEnd: end,
                                categoryName: categoryName,
                                displayName: displayName,
                                bundleIdentifier: bundleIdentifier,
                                duration:
                                    applicationActivity
                                        .totalActivityDuration,
                                pickups:
                                    applicationActivity.numberOfPickups,
                                notifications:
                                    applicationActivity
                                        .numberOfNotifications
                            )
                        )
                    }
                }
            }
        }

        segments.sort { left, right in
            left.start < right.start
        }

        applications.sort { left, right in
            if left.segmentStart != right.segmentStart {
                return left.segmentStart < right.segmentStart
            }

            if left.duration != right.duration {
                return left.duration > right.duration
            }

            return left.displayName < right.displayName
        }

        devices.sort { left, right in
            left.name < right.name
        }

        Self.logger.notice(
            "SNOWBALL_SCREEN_TIME: makeConfiguration 汇总完成，segments=\(segments.count, privacy: .public)，applications=\(applications.count, privacy: .public)，devices=\(devices.count, privacy: .public)"
        )

        SnowballScreenTimeSharedStore.save(
            totalDuration: totalDuration,
            segments: segments,
            applications: applications,
            devices: devices
        )

        Self.logger.notice("SNOWBALL_SCREEN_TIME: makeConfiguration 即将返回")

        return TotalActivityConfiguration(
            totalDuration: totalDuration,
            segments: segments,
            applications: applications,
            devices: devices
        )
    }
}

