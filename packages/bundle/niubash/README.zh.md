# @cmx666/dsh-niubash-bundle

Windows 上启用 Niubash 的一条命令 DSH profile bundle。

```sh
dsh plugin --profile web add @cmx666/dsh-niubash-bundle
```

此 bundle 会安装 Niubash Provider，启用 `niubash-sandbox` 和 `tool-bash`，并禁用 PowerShell shell/tool。请另外安装 Niubash，并确保 `niu.exe` 位于 `PATH`，然后正常启动 `dsh web`。
