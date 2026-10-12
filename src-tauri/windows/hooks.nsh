; ymd NSIS installer hooks (bundle.windows.nsis.installerHooks).
;
; The cookie-bridge host registration (HKCU ...\NativeMessagingHosts\com.ymd.cookies) is written
; by ymd itself on every launch (src/auth/native_registry.rs); the uninstaller removes it here.
;
; The Chrome Web Store external-extension keys make Chrome, Brave and Edge offer
; «ymd Cookies» on their next start. They are written while YMD_STORE_EXTENSION is defined,
; which mirrors STORE_EXTENSION_ENABLED in native_registry.rs. Keep both lists in sync with
; that file (a unit test checks it).

!define YMD_STORE_EXTENSION

!macro NSIS_HOOK_POSTINSTALL
  !ifdef YMD_STORE_EXTENSION
    WriteRegStr HKCU "Software\Google\Chrome\Extensions\hhojlkpllmndkaolmebblijfcjkjpdpi" "update_url" "https://clients2.google.com/service/update2/crx"
    WriteRegStr HKCU "Software\BraveSoftware\Brave-Browser\Extensions\hhojlkpllmndkaolmebblijfcjkjpdpi" "update_url" "https://clients2.google.com/service/update2/crx"
    WriteRegStr HKCU "Software\Microsoft\Edge\Extensions\hhojlkpllmndkaolmebblijfcjkjpdpi" "update_url" "https://clients2.google.com/service/update2/crx"
  !endif
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.ymd.cookies"
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.ymd.cookies"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.ymd.cookies"
  DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\com.ymd.cookies"
  DeleteRegKey HKCU "Software\Vivaldi\NativeMessagingHosts\com.ymd.cookies"
  DeleteRegKey HKCU "Software\Google\Chrome\Extensions\hhojlkpllmndkaolmebblijfcjkjpdpi"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\Extensions\hhojlkpllmndkaolmebblijfcjkjpdpi"
  DeleteRegKey HKCU "Software\Microsoft\Edge\Extensions\hhojlkpllmndkaolmebblijfcjkjpdpi"
!macroend
