//
//  SnowballScreenTimeReport.swift
//  SnowballScreenTimeReport
//
//  Created by Jason Zhao on 24/7/2026.
//

import DeviceActivity
import ExtensionKit
import SwiftUI

@main
struct SnowballScreenTimeReport: DeviceActivityReportExtension {
    var body: some DeviceActivityReportScene {
        TotalActivityReport { configuration in
            TotalActivityView(configuration: configuration)
        }

        SevenDayAverageReport { configuration in
            SevenDayAverageView(configuration: configuration)
        }

        SevenDayDailyTableReport { configuration in
            SevenDayDailyTableView(configuration: configuration)
        }

        SnowballHomeMiniReport { configuration in
            SnowballHomeMiniView(configuration: configuration)
        }

        SnowballDashboardTodayReport { configuration in
            SnowballDashboardView(configuration: configuration)
        }

        SnowballDashboardYesterdayReport { configuration in
            SnowballDashboardView(configuration: configuration)
        }

        SnowballDashboardWeekReport { configuration in
            SnowballDashboardView(configuration: configuration)
        }

        SnowballDashboardPreviousWeekReport { configuration in
            SnowballDashboardView(configuration: configuration)
        }

        SnowballDashboardMonthReport { configuration in
            SnowballDashboardView(configuration: configuration)
        }

    }
}
