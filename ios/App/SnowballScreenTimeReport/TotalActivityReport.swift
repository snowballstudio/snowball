//
//  TotalActivityReport.swift
//  SnowballScreenTimeReport
//
//  Created by Jason Zhao on 24/7/2026.
//

import DeviceActivity
import ExtensionKit
import Foundation
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
        var totalDuration: TimeInterval = 0
        var categoryDurations: [String: TimeInterval] = [:]

        // DeviceActivityResults、activitySegments 和 categories 都是异步序列。
        // 直接逐层 for await，避免把 AsyncFlatMapSequence 当普通数组使用。
        for await deviceData in data {
            for await segment in deviceData.activitySegments {
                totalDuration += segment.totalActivityDuration

                for await categoryActivity in segment.categories {
                    let displayName =
                        categoryActivity.category.localizedDisplayName

                    let name =
                        displayName?.isEmpty == false
                        ? displayName!
                        : "其它"

                    categoryDurations[name, default: 0] +=
                        categoryActivity.totalActivityDuration
                }
            }
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
                    return $0.name.localizedCompare($1.name)
                        == .orderedAscending
                }

                return $0.duration > $1.duration
            }

        return TotalActivityConfiguration(
            totalDuration: totalDuration,
            categories: categories
        )
    }
}
