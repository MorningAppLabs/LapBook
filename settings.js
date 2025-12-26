/**
 * Settings Manager - handles loading, saving, and applying user preferences
 * Settings are persisted locally and survive app restarts
 */

class SettingsManager {
  constructor() {
    // Default settings
    this.defaults = {
      fontSize: 18,
      fontFamily: 'serif',
      lineSpacing: 1.6,
      marginSize: 50,
      theme: 'sepia', // white, sepia, dark
      mouseWheelNav: true, // Enable mouse wheel page navigation
      pageAnimation: true, // Enable page turn animations
      lastBookPath: null,
      lastLocation: null
    };
    
    this.settings = { ...this.defaults };
  }

  /**
   * Load settings from disk
   */
  async load() {
    try {
      const saved = await window.electronAPI.loadSettings();
      if (saved) {
        // Merge saved settings with defaults (in case new settings were added)
        this.settings = { ...this.defaults, ...saved };
      }
      return this.settings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      return this.settings;
    }
  }

  /**
   * Save settings to disk
   */
  async save() {
    try {
      await window.electronAPI.saveSettings(this.settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  /**
   * Get a specific setting value
   */
  get(key) {
    return this.settings[key];
  }

  /**
   * Set a specific setting value
   */
  set(key, value) {
    this.settings[key] = value;
  }

  /**
   * Get all settings
   */
  getAll() {
    return { ...this.settings };
  }

  /**
   * Reset to default settings
   */
  reset() {
    this.settings = { ...this.defaults };
  }

  /**
   * Apply reading settings to the book renderer
   */
  applyToRenderer(rendition) {
    if (!rendition) return;

    // Apply font size
    rendition.themes.fontSize(`${this.settings.fontSize}px`);

    // Apply font family
    rendition.themes.override('font-family', this.settings.fontFamily);

    // Apply line spacing
    rendition.themes.override('line-height', this.settings.lineSpacing);

    // Apply margins
    const margin = this.settings.marginSize;
    rendition.themes.override('padding', `${margin}px`);
  }

  /**
   * Apply theme colors
   */
  applyTheme(rendition) {
    if (!rendition) return;

    const themes = {
      white: {
        body: { background: '#ffffff', color: '#000000' }
      },
      sepia: {
        body: { background: '#f5f5dc', color: '#3a2f1d' }
      },
      kindle: {
        body: { background: '#c2e6c9', color: '#1a3a1e' }
      },
      blue: {
        body: { background: '#e3f2fd', color: '#0d47a1' }
      },
      gray: {
        body: { background: '#f5f5f5', color: '#212121' }
      },
      dark: {
        body: { background: '#1e1e1e', color: '#e0e0e0' }
      }
    };

    const theme = themes[this.settings.theme] || themes.sepia;
    rendition.themes.override('color', theme.body.color);
    rendition.themes.override('background', theme.body.background);
  }

  /**
   * Get theme colors for UI elements
   */
  getThemeColors() {
    const themes = {
      white: {
        background: '#ffffff',
        color: '#000000',
        toolbar: '#f0f0f0',
        border: '#d0d0d0'
      },
      sepia: {
        background: '#f5f5dc',
        color: '#3a2f1d',
        toolbar: '#ebe8d8',
        border: '#d4cdb8'
      },
      kindle: {
        background: '#c2e6c9',
        color: '#1a3a1e',
        toolbar: '#b0d9b8',
        border: '#9fcba7'
      },
      blue: {
        background: '#e3f2fd',
        color: '#0d47a1',
        toolbar: '#bbdefb',
        border: '#90caf9'
      },
      gray: {
        background: '#f5f5f5',
        color: '#212121',
        toolbar: '#e0e0e0',
        border: '#bdbdbd'
      },
      dark: {
        background: '#1e1e1e',
        color: '#e0e0e0',
        toolbar: '#2d2d2d',
        border: '#444444'
      }
    };

    return themes[this.settings.theme] || themes.sepia;
  }
}
