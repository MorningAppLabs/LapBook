# LapBook Changelog

## Version 1.1.0 (December 27, 2025)

### Enhanced Reading Experience 🚀

**New Features:**
- 📐 **Column Layout Toggle**: Choose between single or double column text layout for optimal reading
- 📱 **Touch Gestures**: Swipe left/right to navigate pages on touchscreen devices
- 👆 **Full-Height Navigation Arrows**: Large, always-accessible arrow buttons on screen edges for easy page navigation
- ✍️ **Text Alignment Options**: Left, Right, or Justify text alignment
- 🎨 **Individual Reset Buttons**: Reset specific settings without losing all customizations
- 📍 **Smart Context Menu**: Highlight menu now appears right next to selected text (not fixed to right)
- ✨ **HIGHLY VISIBLE HIGHLIGHTS**: Bright, prominent highlights like Kindle/Calibre (70% opacity, vibrant colors)
- 🔤 **Bold Highlighted Text**: Highlighted text is now darker and bolder for maximum readability
- 🗑️ **Delete Highlight Option**: Click on existing highlights to see "Delete Highlight" option in context menu
- 📌 **Highlight Storage Info**: New information panel showing where highlights are saved and what happens when books are removed

**Improvements:**
- ✅ **Fixed Margins Persistence**: Margins now properly persist when navigating between pages
- ✅ **Fixed Line Spacing Persistence**: Line spacing stays consistent throughout reading session
- ✅ **Fixed Highlight Removal**: Highlights now completely remove instantly without leaving background color
- ✅ **Fixed Highlight Persistence**: Highlights now persist when navigating pages AND when closing/reopening app
- ⚡ **Page Turn Animations**: Verified and ensured page turn animations work correctly
- 🎯 **Better Settings Organization**: Clearer categorization with "Reset All" button prominently displayed
- 🐛 **Enhanced Debugging**: Added console logging to track highlight save/load operations

**UI Enhancements:**
- Individual "↻" reset buttons next to Line Spacing, Margins, Column Layout, and Text Alignment
- Info box explaining highlight storage location and book removal behavior
- Navigation arrows that appear on hover and work on any screen height
- Improved context menu positioning relative to selected text
- Kindle-style highlight colors: Bright yellow, green, blue, pink, and orange
- Highlighted text is now bold and dark for perfect contrast

**Technical:**
- Enhanced settings manager with column layout and text alignment support
- Touch gesture detection with swipe threshold (50px minimum)
- Dynamic context menu button injection for highlighted text
- Improved iframe-relative positioning calculations
- Highlight CSS injection using epub.js themes system
- Console logging in both main and renderer processes for debugging
- Fixed epub.js API parameter ordering for annotations

---

## Version 1.0.0 (December 27, 2025)

### Initial Release 🎉

**Core Features:**
- 📚 Support for EPUB and PDF formats
- 🎨 6 beautiful reading themes (White, Sepia, Nottingham Green, Blue, Gray, Dark)
- 📖 Smart library management with recently opened books
- 💾 Automatic reading progress saving and resume
- 🔍 Full-text search with keyword highlighting
- ✏️ Text annotations (EPUB): Highlights and notes
- 📝 Context menu on text selection with dictionary lookup
- 🔤 Customizable fonts, sizes, spacing, and margins
- ⌨️ Comprehensive keyboard navigation
- 🖥️ Fullscreen reading mode (F11)
- 📊 Edit book metadata (title, author)
- 🎯 PDF features: Zoom controls, fit-to-page, page navigation
- 🌐 Dictionary integration with Free Dictionary API
- 🎨 Professional sepia-themed dashboard
- ⚡ Fast and lightweight (no internet required)

**Technical:**
- Built with Electron 28.0
- epub.js for EPUB rendering
- PDF.js for PDF support
- Modern UI with smooth animations
- Secure IPC communication
- Local storage for library and settings

---

*Developed by Morning App Labs*
