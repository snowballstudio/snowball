//
//  TotalActivityReport.swift
//  SnowballScreenTimeReport
//
//  Created by Jason Zhao on 24/7/2026.
//

import DeviceActivity
import ExtensionKit
import ManagedSettings
import SwiftUI

extension DeviceActivityReport.Context {
    static let totalActivity = Self("Total Activity")
}

struct ScreenTimeCategoryRow: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let duration: TimeInterval
}

struct TotalActivityConfiguration: Sendable {
    let totalDuration: TimeInterval
    let categories: [ScreenTimeCategoryRow]
}

struct TotalActivityReport: DeviceActivityReportScene {
    let context: DeviceActivityReport.Context = .totalActivity
    let content: (TotalActivityConfiguration) -> TotalActivityView

    func makeConfiguration(
        representing data: DeviceActivityResults<DeviceActivityData>
    ) async -> TotalActivityConfiguration {
        let activitySegments = await data.flatMap { $0.activitySegments }

        let totalDuration = activitySegments.reduce(0) {
            $0 + $1.totalActivityDuration
        }

        let categoryActivities = await activitySegments.flatMap {
            $0.categories
        }

        var categoryDurations: [String: TimeInterval] = [:]

        for categoryActivity in categoryActivities {
            let rawName = categoryActivity.category.localizedDisplayName?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let name = (rawName?.isEmpty == false) ? rawName! : "其它"

            categoryDurations[name, default: 0] +=
                categoryActivity.totalActivityDuration
        }

        let categories = categoryDurations
            .map {
                ScreenTimeCategoryRow(
                    id: $0.key,
                    name: $0.key,
                    duration: $0.value
                )
            }
            .sorted {
                if $0.duration == $1.duration {
                    return $0.name.localizedCompare($1.name) == .orderedAscending
                }
                return $0.duration > $1.duration
            }

        return TotalActivityConfiguration(
            totalDuration: totalDuration,
            categories: categories
        )
    }
}
