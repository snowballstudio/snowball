import DeviceActivity
import ExtensionKit
import Foundation
import ManagedSettings
import OSLog
import SwiftUI

extension DeviceActivityReport.Context {
    static let totalActivity = Self("Total Activity")
    static let sevenDayAverage = Self("Snowball Seven Day Average")
    static let sevenDayDailyTable =
        Self("Snowball Seven Day Daily Table")
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


struct SevenDayDailyTableReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .sevenDayDailyTable
    let content: (SevenDayAverageConfiguration) -> SevenDayDailyTableView

    func makeConfiguration(
        representing data: DeviceActivityResults<DeviceActivityData>
    ) async -> SevenDayAverageConfiguration {
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
