# @cmx666/dsh-niubash-bundle

One-command DSH profile bundle for Windows Niubash support.

```sh
dsh plugin --profile web add @cmx666/dsh-niubash-bundle
```

The bundle installs the Niubash providers, enables `niubash-sandbox` and `tool-bash`, and disables the PowerShell shell/tool rows. Install Niubash separately and ensure `niu.exe` is on `PATH`, then start DSH normally with `dsh web`.
