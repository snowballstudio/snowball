import DeviceActivity
import ExtensionKit
import Foundation
import ManagedSettings
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
    static let appGroupIdentifier = "group.com.snowball.health"
    static let cacheKey = "snowball.ios-screen-time.days.v1"

    static func save(
        totalDuration: TimeInterval,
        segments: [ScreenTimeSegmentRow],
        applications: [ScreenTimeApplicationRow],
        devices: [ScreenTimeDeviceRow]
    ) {
        guard let defaults = UserDefaults(
            suiteName: appGroupIdentifier
        ) else {
            return
        }

        guard let reportDate = reportDate(
            segments: segments,
            applications: applications
        ) else {
            return
        }

        let dateText = dateFormatter.string(from: reportDate)

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
                // DeviceActivity exposes the segment's first pickup.
                // The JS calculation accepts this field as the pickup
                // reference for the final active hour.
                item["lastPickupTime"] =
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

        if let oldData = defaults.data(forKey: cacheKey),
           let oldObject = try? JSONSerialization.jsonObject(
                with: oldData
           ) as? [String: Any],
           let oldDays = oldObject["days"]
                as? [[String: Any]] {
            for oldDay in oldDays {
                if let oldDate = oldDay["date"] as? String {
                    daysByDate[oldDate] = oldDay
                }
            }
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

        guard JSONSerialization.isValidJSONObject(cache),
              let data = try? JSONSerialization.data(
                withJSONObject: cache
              ) else {
            return
        }

        defaults.set(data, forKey: cacheKey)
        defaults.synchronize()
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
    let context: DeviceActivityReport.Context = .totalActivity
    let content: (TotalActivityConfiguration) -> TotalActivityView

    func makeConfiguration(
        representing data: DeviceActivityResults<DeviceActivityData>
    ) async -> TotalActivityConfiguration {
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

        SnowballScreenTimeSharedStore.save(
            totalDuration: totalDuration,
            segments: segments,
            applications: applications,
            devices: devices
        )

        return TotalActivityConfiguration(
            totalDuration: totalDuration,
            segments: segments,
            applications: applications,
            devices: devices
        )
    }
}
