在 Mac 上执行 npm install 后：
1. npm install @capacitor/ios
2. npx cap add ios（若 ios/ 尚不存在）
3. 把 DeviceDataPlugin.swift 和 MyViewController.swift 拖入 Xcode 的 App/App 组，并勾选 App target。
4. 在 Main.storyboard 中选中 Bridge View Controller，把 Custom Class 改成 MyViewController。
5. Target > Signing & Capabilities > + Capability > HealthKit。
6. 在 Info.plist 增加：
   Privacy - Health Share Usage Description
   值：雪球读取步数，用于生成个人生活数据与猫咪状态；数据只保存在本机。
7. npm run build && npx cap sync ios
8. 连接 iPhone，选择免费 Apple ID Team 后 Run。
