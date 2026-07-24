//
//  TotalActivityReport.swift
//  SnowballScreenTimeReport
//

import DeviceActivity
import ExtensionKit
import SwiftUI

extension DeviceActivityReport.Context {
    static let totalActivity = Self("Total Activity")
}

struct SnowballCategoryActivity: Identifiable, Hashable {
    let id: String
    let name: String
    let duration: TimeInterval
    let pickups: Int
    let applicationCount: Int
}

struct SnowballTotalActivityConfiguration {
    let totalDuration: TimeInterval
    let categories: [SnowballCategoryActivity]
    let segmentCount: Int
}

struct TotalActivityReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .totalActivity
    let content: (SnowballTotalActivityConfiguration) -> TotalActivityView

    func makeConfiguration(
        representing data: DeviceActivityResults<DeviceActivityData>
    ) async -> SnowballTotalActivityConfiguration {
        var totalDuration: TimeInterval = 0
        var segmentCount = 0
        var categoryBuckets: [String: SnowballCategoryActivity] = [:]

        for await deviceData in data {
            for await segment in deviceData.activitySegments {
                segmentCount += 1
                totalDuration += segment.totalActivityDuration

                for await categoryActivity in segment.categories {
                    let rawName = categoryActivity.category.localizedDisplayName
                    let name = rawName?.isEmpty == false ? rawName! : "未命名类别"
                    let key = name

                    var appCount = 0
                    for await _ in categoryActivity.applications {
                        appCount += 1
                    }

                    let previous = categoryBuckets[key]
                    categoryBuckets[key] = SnowballCategoryActivity(
                        id: key,
                        name: name,
                        duration: (previous?.duration ?? 0) + categoryActivity.totalActivityDuration,
                        pickups: (previous?.pickups ?? 0) + categoryActivity.numberOfPickups,
                        applicationCount: max(previous?.applicationCount ?? 0, appCount)
                    )
                }
            }
        }

        let categories = categoryBuckets.values.sorted {
            if $0.duration == $1.duration {
                return $0.name.localizedCompare($1.name) == .orderedAscending
            }
            return $0.duration > $1.duration
        }

        return SnowballTotalActivityConfiguration(
            totalDuration: totalDuration,
            categories: categories,
            segmentCount: segmentCount
        )
    }
}
