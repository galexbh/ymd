; ymd NSIS installer hooks (bundle.windows.nsis.installerHooks).
;
; The cookie-bridge host registration (HKCU ...\NativeMessagingHosts\com.ymd.cookies) is written
; by ymd itself on every launch (src/auth/native_registry.rs); the uninstaller removes it here.
;
; The Chrome Web Store external-extension keys are prepared but off: they are written only
; when the installer is compiled with YMD_STORE_EXTENSION defined, which mirrors
; STORE_EXTENSION_ENABLED in native_registry.rs. Keep both lists in sync with that file
; (a unit test checks it).

!macro NSIS_HOOK_POSTINSTALL
  !ifdef YMD_STORE_EXTENSION
    WriteRegStr HKCU "Software\Google\Chrome\Extensions\gicaphbpepkphmeciigjhdpnbcaflfgd" "update_url" "https://clients2.google.com/service/update2/crx"
    WriteRegStr HKCU "Software\BraveSoftware\Brave-Browser\Extensions\gicaphbpepkphmeciigjhdpnbcaflfgd" "update_url" "https://clients2.google.com/service/update2/crx"
    WriteRegStr HKCU "Software\Microsoft\Edge\Extensions\gicaphbpepkphmeciigjhdpnbcaflfgd" "update_url" "https://clients2.google.com/service/update2/crx"
  !endif
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.ymd.cookies"
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.ymd.cookies"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.ymd.cookies"
  DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\com.ymd.cookies"
  DeleteRegKey HKCU "Software\Vivaldi\NativeMessagingHosts\com.ymd.cookies"
  DeleteRegKey HKCU "Software\Google\Chrome\Extensions\gicaphbpepkphmeciigjhdpnbcaflfgd"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\Extensions\gicaphbpepkphmeciigjhdpnbcaflfgd"
  DeleteRegKey HKCU "Software\Microsoft\Edge\Extensions\gicaphbpepkphmeciigjhdpnbcaflfgd"
!macroend
