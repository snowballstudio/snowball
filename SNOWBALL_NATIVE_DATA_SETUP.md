# 雪球 V89 原生数据接入说明

## 已完成
- Android Health Connect：读取每日步数（按自然日 00:00–24:00 聚合，避免多来源重复计数）。
- Android UsageStats：读取雪球日 05:00–次日 05:00 的 APP 前台时长、打开次数、最后有效使用时间。
- 凌晨时间显示为 24:00–28:59，例如次日 02:15 显示 26:15。
- 原始 APP 名和 Package Name 写入 screenRecords；别名匹配只影响雪球名、列车和榜单。
- iOS HealthKit 步数插件代码已放入 ios-plugin-files；iOS 屏幕时间不在本轮范围内。
- App 启动和重新回到前台时自动刷新最近 8 天数据。

## Windows / Android 首次运行
1. 在项目目录执行 `npm install`。
2. 执行 `npm run build`。
3. 执行 `npx cap sync android`。
4. 用 Android Studio 打开 `android` 文件夹。
5. 连接华为手机并 Run。
6. 第一次打开雪球：允许 Health Connect 的步数读取。
7. 按提示进入“使用情况访问权限”，为雪球开启权限，然后返回雪球。
8. 华为运动健康的步数需先通过 Health Sync 写入 Health Connect。

## 注意
- AndroidManifest 暂时加入 QUERY_ALL_PACKAGES，目的是在家庭测试阶段可靠显示真实 APP 名。以后提交 Google Play 前需按商店政策缩小包可见性范围。
- APP 打开次数按“进入前台”事件计算，并对 2 秒内重复事件去重。
- 屏幕总时长是各 APP 前台有效时长之和，不把只亮锁屏看时间计算为 APP 使用。
- 第一次真机测试后，应核对华为返回的数据，再调整少数厂商差异。

## 生成测试 APK
Android Studio 中选择 Build > Build APK(s)。调试 APK 通常位于：
`android/app/build/outputs/apk/debug/app-debug.apk`

家庭验证通过后再创建永久签名密钥，生成 release APK 上传 GitHub Releases。

## V90 数据同步规则

- 首次成功授权后，日常表与 APP 详情表分别导入最近 7 个完整日期（从昨天开始）。
- 以后每个自然日第一次启动雪球时，只尝试读取昨天一次。
- 自动读取只补充缺失日期，不覆盖任何已经存在的日常记录或 APP 详情记录。
- 从后台返回不再触发同步。
- 日常表每行的“↻”只重新读取该日的步数、离机时间和屏幕总时长，不改变 APP 详情表。
- APP 详情页的“重新获取这一天”只替换该日的 APP 名称、Package、使用时间与打开次数，不改变日常表。
- iPhone 当前只重新读取 HealthKit 步数；Android 可读取步数、离机、屏幕总时长与 APP 详情。
