!macro customUnInstall
  ${ifNot} ${isUpdated}
    ReadRegStr $0 HKCU "Software\Classes\diagrams\shell\open\command" ""
    ${if} $0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
      DeleteRegKey HKCU "Software\Classes\diagrams"
    ${endIf}
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    ${if} $0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background'
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${APP_ID}"
    ${endIf}
  ${endIf}
!macroend
