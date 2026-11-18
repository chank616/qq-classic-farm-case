' Starts the single-instance farm tray. It schedules checks while QQ is running.
' Disable logon startup with setup-autostart.ps1 -Remove.
Dim fso, here, script
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
script = here & "\tray\bin\Release\net10.0-windows\FarmTray.exe"
CreateObject("WScript.Shell").Run """" & script & """", 0, False
