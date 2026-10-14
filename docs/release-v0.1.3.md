鲸鱼娘新增 Apple Silicon（M 系列芯片）和 Windows 安装包，并继续提供 Intel Mac 版本。

| 设备 | 下载文件 |
| --- | --- |
| Mac，M 系列芯片 | `WhaleChan-0.1.3-mac-arm64.dmg` |
| Mac，Intel 芯片 | `WhaleChan-0.1.3-mac-x64.dmg` |
| Windows，Intel / AMD 64 位 | `WhaleChan-0.1.3-win-x64.exe` |

Mac 打开 DMG 后将应用拖到 Applications；Windows 运行安装向导，可选择安装目录。

本版在 GitHub 的原生 macOS arm64、macOS x64、Windows x64 环境中分别构建，运行记忆与存储测试、源码桌面流程测试、打包后程序的桌面流程测试。测试使用本机模拟 API，不使用用户私人数据；未验证真实模型供应商或 Windows 安装向导的完整人工交互。

Windows 适配了原生窗口按钮、菜单和平台说明。Mac 使用本地 ad-hoc 签名，尚无 Apple Developer ID 签名与公证；Windows 未进行代码签名。系统可能提示首次运行，当前仍是预览版。

各平台数据保存在各自设备，不会自动同步。API 密钥由所在系统加密保护；使用云端模型时，必要的对话和记忆会发送给所选服务商。iPhone 互通尚未提供。

附 `SHA256SUMS.txt` 用于校验下载文件。鲸鱼娘美术来源与完整署名见仓库 `src/assets/whale/NOTICE.md`。
