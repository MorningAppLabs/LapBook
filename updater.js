// Auto-updater for LapBook
// Checks GitHub releases for new versions
const { app, dialog, shell } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_REPO = 'MorningAppLabs/LapBook'; // Update this to your GitHub repo
const UPDATE_CHECK_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/**
 * Get the version file path
 */
function getVersionFilePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'last-version.json');
}

/**
 * Get the last shown changelog version
 */
function getLastShownVersion() {
  try {
    const versionFile = getVersionFilePath();
    if (fs.existsSync(versionFile)) {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      return data.lastShownVersion || null;
    }
  } catch (error) {
    console.error('Error reading version file:', error);
  }
  return null;
}

/**
 * Save the last shown changelog version
 */
function saveLastShownVersion(version) {
  try {
    const versionFile = getVersionFilePath();
    fs.writeFileSync(versionFile, JSON.stringify({ lastShownVersion: version }));
  } catch (error) {
    console.error('Error saving version file:', error);
  }
}

/**
 * Check for updates from GitHub
 */
function checkForUpdates(mainWindow, showNoUpdateDialog = false) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'LapBook-Updater'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const release = JSON.parse(data);
            const latestVersion = release.tag_name.replace('v', '');
            const currentVersion = app.getVersion();

            console.log(`Current version: ${currentVersion}, Latest version: ${latestVersion}`);

            if (compareVersions(latestVersion, currentVersion) > 0) {
              // New version available
              const response = dialog.showMessageBoxSync(mainWindow, {
                type: 'info',
                title: 'Update Available',
                message: `A new version of LapBook is available!`,
                detail: `Current version: ${currentVersion}\nNew version: ${latestVersion}\n\n${release.name}\n\nWould you like to download it?`,
                buttons: ['Download Update', 'Later'],
                defaultId: 0,
                cancelId: 1
              });

              if (response === 0) {
                // Open release page in browser
                shell.openExternal(release.html_url);
              }
              resolve({ updateAvailable: true, version: latestVersion });
            } else {
              // Up to date
              if (showNoUpdateDialog) {
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'No Updates',
                  message: 'You are using the latest version of LapBook!',
                  detail: `Version ${currentVersion}`
                });
              }
              resolve({ updateAvailable: false });
            }
          } else {
            console.error('Failed to check for updates:', res.statusCode);
            resolve({ updateAvailable: false, error: true });
          }
        } catch (error) {
          console.error('Error parsing update response:', error);
          resolve({ updateAvailable: false, error: true });
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error checking for updates:', error);
      if (showNoUpdateDialog) {
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Update Check Failed',
          message: 'Could not check for updates',
          detail: 'Please check your internet connection and try again.'
        });
      }
      resolve({ updateAvailable: false, error: true });
    });

    req.end();
  });
}

/**
 * Compare two semantic version strings
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

/**
 * Show changelog if this is a new version
 */
function showChangelogIfNeeded(mainWindow) {
  const currentVersion = app.getVersion();
  const lastShownVersion = getLastShownVersion();

  if (!lastShownVersion || lastShownVersion !== currentVersion) {
    // This is first run or a new version - show changelog
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        mainWindow.webContents.send('show-changelog');
        saveLastShownVersion(currentVersion);
      }, 1000); // Wait 1 second after load
    });
  }
}

module.exports = {
  checkForUpdates,
  showChangelogIfNeeded
};
