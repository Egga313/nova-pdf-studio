/**
 * خطاف electron-builder بعد التغليف: يكتب بيانات إصدار الملف التنفيذي (الاسم، الوصف، الشركة، الأيقونة) عبر rcedit.
 * السبب: signAndEditExecutable معطّل (تنزيل winCodeSign يفشل بلا صلاحية symlink على Windows)، فبدونه يظهر
 * البرنامج في «فتح باستخدام» باسم "Electron" وبأيقونة Electron الافتراضية.
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const pkg = require(path.join(context.packager.projectDir, 'package.json'))
  const productName = context.packager.appInfo.productName
  const exe = path.join(context.appOutDir, `${productName}.exe`)
  const rcedit = path.join(context.packager.projectDir, 'build', 'tools', 'rcedit-x64.exe')
  const icon = path.join(context.packager.projectDir, 'build', 'icon.ico')
  if (!fs.existsSync(exe) || !fs.existsSync(rcedit)) {
    console.warn('[afterPack] rcedit or exe missing, skipping', { exe, rcedit })
    return
  }
  const version = `${pkg.version}.0`
  const args = [
    exe,
    '--set-version-string', 'FileDescription', productName,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'CompanyName', pkg.author || productName,
    '--set-version-string', 'LegalCopyright', `Copyright © ${new Date().getFullYear()} ${pkg.author || productName}`,
    '--set-version-string', 'OriginalFilename', `${productName}.exe`,
    '--set-version-string', 'InternalName', productName,
    '--set-file-version', version,
    '--set-product-version', version
  ]
  if (fs.existsSync(icon)) args.push('--set-icon', icon)
  execFileSync(rcedit, args, { stdio: 'inherit' })
  console.log(`[afterPack] exe metadata written: ${productName} ${version}${fs.existsSync(icon) ? ' + icon' : ''}`)
}
