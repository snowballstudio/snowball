import DeviceActivity
import ExtensionKit
import Foundation
import ManagedSettings
import OSLog
import SwiftUI

extension DeviceActivityReport.Context {
    static let totalActivity = Self("Total Activity")
    static let sevenDayAverage = Self("Snowball Seven Day Average")
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


struct SevenDayApplicationSummary: Sendable {
    let displayName: String
    let bundleIdentifier: String
    let categoryName: String
    let duration: TimeInterval
    let pickups: Int
}

struct SevenDayScreenSummary: Sendable {
    let date: Date
    let totalDuration: TimeInterval
    let applications: [SevenDayApplicationSummary]
}

struct SevenDayAverageConfiguration: Sendable {
    let averageDuration: TimeInterval
    let totalDuration: TimeInterval
    let dayCount: Int
    let days: [SevenDayScreenSummary]
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
    static let sevenDaySummaryCacheKey =
        "snowball.ios-screen-time.seven-day-summary.v1"

    // 跨进程桥接文件。苹果报告能够显示，只代表 Extension 已读取数据；
    // 主页和每日表还需要通过 App Group 把汇总结果交给主 App。
    static let detailFileName =
        "snowball-ios-screen-time-days-v1.json"
    static let sevenDaySummaryFileName =
        "snowball-ios-screen-time-seven-day-summary-v1.json"
    static let diagnosticFileName =
        "snowball-ios-screen-time-extension-diagnostic-v1.json"

    private static func appGroupContainerURL() -> URL? {
        FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier:
                appGroupIdentifier
        )
    }

    @discardableResult
    private static func writeSharedFile(
        data: Data,
        fileName: String
    ) -> Bool {
        guard let containerURL = appGroupContainerURL() else {
            diagnostic(
                "共享文件写入失败：无法取得 App Group 容器，file=\(fileName)"
            )
            return false
        }

        let fileURL = containerURL.appendingPathComponent(
            fileName,
            isDirectory: false
        )

        do {
            try data.write(to: fileURL, options: [.atomic])
            let readBack = try Data(contentsOf: fileURL)
            let success = readBack == data
            diagnostic(
                "共享文件写入\(success ? "成功" : "失败")：" +
                "file=\(fileName)，bytes=\(readBack.count)"
            )
            return success
        } catch {
            diagnostic(
                "共享文件写入异常：file=\(fileName)，" +
                "error=\(error.localizedDescription)"
            )
            return false
        }
    }

    static func writeExtensionDiagnostic(
        event: String,
        extra: [String: Any] = [:]
    ) {
        var payload: [String: Any] = [
            "event": event,
            "checkedAt": isoFormatter.string(from: Date()),
            "appGroupIdentifier": appGroupIdentifier,
            "containerAvailable": appGroupContainerURL() != nil
        ]

        for (key, value) in extra {
            payload[key] = value
        }

        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(
                withJSONObject: payload
              ) else {
            return
        }

        _ = writeSharedFile(
            data: data,
            fileName: diagnosticFileName
        )
    }


    static func save(
        totalDuration: TimeInterval,
        segments: [ScreenTimeSegmentRow],
        applications: [ScreenTimeApplicationRow],
        devices: [ScreenTimeDeviceRow]
    ) {
        diagnostic("进入 save")
        diagnostic("准备写入 AppGroup：\(appGroupIdentifier)，cacheKey=\(cacheKey)")
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
            diagnostic(
                "致命诊断：reportDate 失败；segments=\(segments.count)，applications=\(applications.count)，缓存不会写入"
            )
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
        let fileWritten = writeSharedFile(
            data: data,
            fileName: detailFileName
        )

        writeExtensionDiagnostic(
            event: "detail-save",
            extra: [
                "defaultsSynchronized": synchronized,
                "fileWritten": fileWritten,
                "bytes": data.count,
                "daysCount": sortedDays.count,
                "cacheKey": cacheKey
            ]
        )

        diagnostic(
            "写入完成：synchronize=\(synchronized)，fileWritten=\(fileWritten)"
        )

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

    static func saveSevenDaySummary(
        days: [SevenDayScreenSummary],
        averageDuration: TimeInterval
    ) {
        guard let defaults = UserDefaults(
            suiteName: appGroupIdentifier
        ) else {
            diagnostic("七日汇总失败：无法打开 App Group")
            return
        }

        let payloadDays: [[String: Any]] = days.map { day in
            let apps = day.applications
                .map { app in
                    [
                        "realAppName": app.displayName,
                        "packageName": app.bundleIdentifier,
                        "categoryName": app.categoryName,
                        "minutes": max(
                            0,
                            Int((app.duration / 60.0).rounded())
                        ),
                        "pickups": max(0, app.pickups)
                    ] as [String: Any]
                }
                .sorted { left, right in
                    let leftMinutes = left["minutes"] as? Int ?? 0
                    let rightMinutes = right["minutes"] as? Int ?? 0
                    if leftMinutes != rightMinutes {
                        return leftMinutes > rightMinutes
                    }
                    return (left["realAppName"] as? String ?? "")
                        .localizedCompare(
                            right["realAppName"] as? String ?? ""
                        ) == .orderedAscending
                }

            return [
                "date": dateFormatter.string(from: day.date),
                "screenMinutes": max(
                    0,
                    Int((day.totalDuration / 60.0).rounded())
                ),
                "totalActivitySeconds": max(
                    0,
                    Int(day.totalDuration.rounded())
                ),
                "apps": apps,
                "hourlyActivity": [],
                "devices": [],
                "sourcePlatform": "ios",
                "generatedAt": isoFormatter.string(from: Date())
            ]
        }

        let payload: [String: Any] = [
            "days": payloadDays,
            "averageMinutes": max(
                0,
                Int((averageDuration / 60.0).rounded())
            ),
            "dayCount": 7,
            "updatedAt": isoFormatter.string(from: Date()),
            "version": 1,
            "source": "ios-device-activity-seven-day-summary"
        ]

        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(
                withJSONObject: payload
              ) else {
            diagnostic("七日汇总失败：JSON 无效")
            return
        }

        defaults.set(data, forKey: sevenDaySummaryCacheKey)
        let synchronized = defaults.synchronize()
        let defaultsReadBack = defaults.data(
            forKey: sevenDaySummaryCacheKey
        )
        let defaultsReadBackValid = defaultsReadBack == data

        let fileWritten = writeSharedFile(
            data: data,
            fileName: sevenDaySummaryFileName
        )

        writeExtensionDiagnostic(
            event: "seven-day-save",
            extra: [
                "defaultsSynchronized": synchronized,
                "defaultsReadBackValid": defaultsReadBackValid,
                "fileWritten": fileWritten,
                "bytes": data.count,
                "daysCount": payloadDays.count,
                "averageMinutes":
                    max(
                        0,
                        Int((averageDuration / 60.0).rounded())
                    ),
                "cacheKey": sevenDaySummaryCacheKey
            ]
        )

        diagnostic(
            "七日汇总写入完成：" +
            "days=\(payloadDays.count)，" +
            "averageMinutes=\(Int((averageDuration / 60.0).rounded()))，" +
            "defaultsReadBackValid=\(defaultsReadBackValid)，" +
            "fileWritten=\(fileWritten)"
        )
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
        Self.logger.notice("SNOWBALL_SCREEN_TIME: 开始遍历 DeviceActivityResults")
        var totalDuration: TimeInterval = 0
        var segments: [ScreenTimeSegmentRow] = []
        var applications: [ScreenTimeApplicationRow] = []
        var devices: [ScreenTimeDeviceRow] = []
        var deviceCount = 0
        var segmentCount = 0
        var categoryCount = 0
        var applicationCount = 0

        for await deviceData in data {
            deviceCount += 1
            Self.logger.notice("SNOWBALL_SCREEN_TIME: 收到 DeviceData #\(deviceCount, privacy: .public)")
            let deviceName = deviceData.device.name ?? "未命名设备"
            let deviceModel = String(describing: deviceData.device.model)
            let deviceID = deviceName + "-" + deviceModel

            Self.logger.notice(
                "SNOWBALL_SCREEN_TIME: Device name=\(deviceName, privacy: .public), model=\(deviceModel, privacy: .public), lastUpdated=\(deviceData.lastUpdatedDate.description, privacy: .public)"
            )

            devices.append(
                ScreenTimeDeviceRow(
                    id: deviceID,
                    name: deviceName,
                    model: deviceModel,
                    lastUpdatedDate: deviceData.lastUpdatedDate
                )
            )

            for await segment in deviceData.activitySegments {
                segmentCount += 1
                Self.logger.notice(
                    "SNOWBALL_SCREEN_TIME: 收到 Segment #\(segmentCount, privacy: .public), start=\(segment.dateInterval.start.description, privacy: .public), end=\(segment.dateInterval.end.description, privacy: .public), duration=\(segment.totalActivityDuration, privacy: .public)"
                )
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
                    categoryCount += 1
                    let rawCategoryName =
                        categoryActivity.category.localizedDisplayName
                    let categoryName =
                        rawCategoryName?.isEmpty == false
                        ? rawCategoryName!
                        : "其它"

                    for await applicationActivity
                        in categoryActivity.applications {
                        applicationCount += 1
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

                        Self.logger.notice(
                            "SNOWBALL_SCREEN_TIME: App #\(applicationCount, privacy: .public), name=\(displayName, privacy: .public), bundle=\(bundleIdentifier, privacy: .public), duration=\(applicationActivity.totalActivityDuration, privacy: .public)"
                        )

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
            "SNOWBALL_SCREEN_TIME: makeConfiguration 汇总完成，deviceCount=\(deviceCount, privacy: .public)，segmentCount=\(segmentCount, privacy: .public)，categoryCount=\(categoryCount, privacy: .public)，applicationCount=\(applicationCount, privacy: .public)，segments=\(segments.count, privacy: .public)，applications=\(applications.count, privacy: .public)，devices=\(devices.count, privacy: .public)，totalSeconds=\(totalDuration, privacy: .public)"
        )

        if deviceCount == 0 {
            Self.logger.error("SNOWBALL_SCREEN_TIME: 致命诊断：DeviceActivityResults 没有返回任何 DeviceData")
        } else if segmentCount == 0 {
            Self.logger.error("SNOWBALL_SCREEN_TIME: 致命诊断：收到 DeviceData，但没有任何 activitySegments")
        } else {
            Self.logger.notice("SNOWBALL_SCREEN_TIME: 数据遍历正常，准备写入 App Group")
        }

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

struct SevenDayAverageReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .sevenDayAverage
    let content: (SevenDayAverageConfiguration) -> SevenDayAverageView

    func makeConfiguration(
        representing data: DeviceActivityResults<DeviceActivityData>
    ) async -> SevenDayAverageConfiguration {
        SnowballScreenTimeSharedStore.writeExtensionDiagnostic(
            event: "seven-day-makeConfiguration-start"
        )

        let calendar = Calendar.autoupdatingCurrent

        struct MutableAppBucket {
            var displayName: String
            var bundleIdentifier: String
            var categoryName: String
            var duration: TimeInterval
            var pickups: Int
        }

        var totalsByDate: [Date: TimeInterval] = [:]
        var appsByDate: [Date: [String: MutableAppBucket]] = [:]

        for await deviceData in data {
            for await segment in deviceData.activitySegments {
                let day = calendar.startOfDay(
                    for: segment.dateInterval.start
                )
                totalsByDate[day, default: 0] +=
                    segment.totalActivityDuration

                for await categoryActivity in segment.categories {
                    let rawCategory =
                        categoryActivity.category.localizedDisplayName
                    let categoryName =
                        rawCategory?.isEmpty == false
                        ? rawCategory!
                        : "其它"

                    for await applicationActivity
                        in categoryActivity.applications {
                        let application =
                            applicationActivity.application
                        let bundle =
                            application.bundleIdentifier
                            ?? "Apple 未返回 Bundle ID"
                        let rawName =
                            application.localizedDisplayName
                        let name =
                            rawName?.isEmpty == false
                            ? rawName!
                            : bundle
                        let key = bundle + "|" + name

                        var bucket = appsByDate[day]?[key]
                            ?? MutableAppBucket(
                                displayName: name,
                                bundleIdentifier: bundle,
                                categoryName: categoryName,
                                duration: 0,
                                pickups: 0
                            )

                        bucket.duration +=
                            applicationActivity.totalActivityDuration
                        bucket.pickups +=
                            applicationActivity.numberOfPickups

                        var dayBuckets = appsByDate[day] ?? [:]
                        dayBuckets[key] = bucket
                        appsByDate[day] = dayBuckets
                    }
                }
            }
        }

        let today = calendar.startOfDay(for: Date())
        let yesterday = calendar.date(
            byAdding: .day,
            value: -1,
            to: today
        ) ?? today

        var days: [SevenDayScreenSummary] = []

        for offset in stride(from: 6, through: 0, by: -1) {
            let date = calendar.date(
                byAdding: .day,
                value: -offset,
                to: yesterday
            ) ?? yesterday

            let normalized = calendar.startOfDay(for: date)
            let apps = (appsByDate[normalized] ?? [:])
                .values
                .map { bucket in
                    SevenDayApplicationSummary(
                        displayName: bucket.displayName,
                        bundleIdentifier: bucket.bundleIdentifier,
                        categoryName: bucket.categoryName,
                        duration: bucket.duration,
                        pickups: bucket.pickups
                    )
                }
                .sorted { left, right in
                    if left.duration != right.duration {
                        return left.duration > right.duration
                    }
                    return left.displayName < right.displayName
                }

            days.append(
                SevenDayScreenSummary(
                    date: normalized,
                    totalDuration:
                        totalsByDate[normalized] ?? 0,
                    applications: apps
                )
            )
        }

        let totalDuration = days.reduce(0) {
            $0 + $1.totalDuration
        }
        let averageDuration = totalDuration / 7.0

        SnowballScreenTimeSharedStore.saveSevenDaySummary(
            days: days,
            averageDuration: averageDuration
        )

        SnowballScreenTimeSharedStore.writeExtensionDiagnostic(
            event: "seven-day-makeConfiguration-finished",
            extra: [
                "daysCount": days.count,
                "averageMinutes":
                    max(
                        0,
                        Int((averageDuration / 60.0).rounded())
                    )
            ]
        )

        return SevenDayAverageConfiguration(
            averageDuration: averageDuration,
            totalDuration: totalDuration,
            dayCount: 7,
            days: days
        )
    }
}

