/**
 * PDF Viewer Module for LapBook
 * Handles PDF file rendering and navigation using PDF.js
 */

// Import PDF.js library
const pdfjsLib = window.pdfjsLib;

class PDFViewer {
  constructor() {
    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.scale = 1.2; // Default zoom level
    this.rendering = false;
    this.pageRendering = false;
    this.pageNumPending = null;
    
    // Canvas elements for rendering
    this.canvas = document.getElementById('pdfCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    
    // Search state
    this.searchMatches = [];
    this.currentSearchIndex = -1;
    this.searchQuery = '';
  }

  /**
   * Load a PDF file from buffer
   * @param {ArrayBuffer} arrayBuffer - PDF file data
   * @returns {Promise<void>}
   */
  async loadPDF(arrayBuffer) {
    try {
      // Set worker source for PDF.js
      pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.js';
      
      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;
      this.currentPage = 1;
      
      // Render the first page
      await this.renderPage(1);
      
      return {
        success: true,
        totalPages: this.totalPages
      };
    } catch (error) {
      console.error('Error loading PDF:', error);
      throw new Error('Failed to load PDF file: ' + error.message);
    }
  }

  /**
   * Render a specific page
   * @param {number} pageNum - Page number to render
   * @returns {Promise<void>}
   */
  async renderPage(pageNum) {
    if (!this.pdfDoc) return;
    
    // Prevent multiple simultaneous renders
    if (this.pageRendering) {
      this.pageNumPending = pageNum;
      return;
    }
    
    this.pageRendering = true;
    this.currentPage = pageNum;
    
    try {
      // Get the page
      const page = await this.pdfDoc.getPage(pageNum);
      
      // Calculate viewport
      const viewport = page.getViewport({ scale: this.scale });
      
      // Set canvas dimensions
      this.canvas.height = viewport.height;
      this.canvas.width = viewport.width;
      
      // Render the page
      const renderContext = {
        canvasContext: this.ctx,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      
      this.pageRendering = false;
      
      // If there's a pending page, render it
      if (this.pageNumPending !== null) {
        const pending = this.pageNumPending;
        this.pageNumPending = null;
        await this.renderPage(pending);
      }
      
      // Update page info
      this.updatePageInfo();
      
    } catch (error) {
      console.error('Error rendering page:', error);
      this.pageRendering = false;
    }
  }

  /**
   * Navigate to next page
   */
  async nextPage() {
    if (this.currentPage < this.totalPages) {
      await this.renderPage(this.currentPage + 1);
    }
  }

  /**
   * Navigate to previous page
   */
  async previousPage() {
    if (this.currentPage > 1) {
      await this.renderPage(this.currentPage - 1);
    }
  }

  /**
   * Go to a specific page
   * @param {number} pageNum - Target page number
   */
  async goToPage(pageNum) {
    if (pageNum >= 1 && pageNum <= this.totalPages) {
      await this.renderPage(pageNum);
    }
  }

  /**
   * Zoom in (increase scale)
   */
  async zoomIn() {
    this.scale = Math.min(this.scale + 0.2, 3.0); // Max 300%
    await this.renderPage(this.currentPage);
  }

  /**
   * Zoom out (decrease scale)
   */
  async zoomOut() {
    this.scale = Math.max(this.scale - 0.2, 0.5); // Min 50%
    await this.renderPage(this.currentPage);
  }

  /**
   * Reset zoom to default
   */
  async resetZoom() {
    this.scale = 1.2;
    await this.renderPage(this.currentPage);
  }

  /**
   * Fit page to screen width
   */
  async fitToPage() {
    if (!this.pdfDoc || !this.canvas) return;
    
    try {
      const page = await this.pdfDoc.getPage(this.currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Get the container width (accounting for padding)
      const containerWidth = this.canvas.parentElement.clientWidth - 40; // 20px padding on each side
      
      // Calculate scale to fit width
      this.scale = containerWidth / viewport.width;
      
      // Cap the scale to reasonable limits
      this.scale = Math.max(0.5, Math.min(3.0, this.scale));
      
      await this.renderPage(this.currentPage);
    } catch (error) {
      console.error('Error fitting page:', error);
    }
  }

  /**
   * Set specific zoom level
   * @param {number} scale - Zoom scale (0.5 to 3.0)
   */
  async setZoom(scale) {
    this.scale = Math.max(0.5, Math.min(3.0, scale));
    await this.renderPage(this.currentPage);
  }

  /**
   * Search for text in the PDF
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of search results
   */
  async searchText(query) {
    if (!this.pdfDoc || !query) {
      this.searchMatches = [];
      return [];
    }
    
    this.searchQuery = query.toLowerCase();
    this.searchMatches = [];
    this.currentSearchIndex = -1;
    
    try {
      // Search through all pages
      for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
        const page = await this.pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Extract text from page
        const pageText = textContent.items.map(item => item.str).join(' ').toLowerCase();
        
        // Find all occurrences in this page
        let index = pageText.indexOf(this.searchQuery);
        while (index !== -1) {
          this.searchMatches.push({
            pageNum: pageNum,
            text: pageText.substr(Math.max(0, index - 30), 100),
            index: index
          });
          index = pageText.indexOf(this.searchQuery, index + 1);
        }
      }
      
      return this.searchMatches;
    } catch (error) {
      console.error('Error searching PDF:', error);
      return [];
    }
  }

  /**
   * Navigate to next search result
   */
  async nextSearchResult() {
    if (this.searchMatches.length === 0) return;
    
    this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchMatches.length;
    const match = this.searchMatches[this.currentSearchIndex];
    await this.goToPage(match.pageNum);
    
    return {
      current: this.currentSearchIndex + 1,
      total: this.searchMatches.length,
      match: match
    };
  }

  /**
   * Navigate to previous search result
   */
  async previousSearchResult() {
    if (this.searchMatches.length === 0) return;
    
    this.currentSearchIndex = this.currentSearchIndex <= 0 
      ? this.searchMatches.length - 1 
      : this.currentSearchIndex - 1;
    const match = this.searchMatches[this.currentSearchIndex];
    await this.goToPage(match.pageNum);
    
    return {
      current: this.currentSearchIndex + 1,
      total: this.searchMatches.length,
      match: match
    };
  }

  /**
   * Get current page information
   * @returns {Object} Page info
   */
  getPageInfo() {
    return {
      current: this.currentPage,
      total: this.totalPages,
      scale: this.scale,
      percentage: Math.round((this.currentPage / this.totalPages) * 100)
    };
  }

  /**
   * Update page info display
   */
  updatePageInfo() {
    const pageInfoEl = document.getElementById('pageInfo');
    if (pageInfoEl && this.totalPages > 0) {
      const percentage = Math.round((this.currentPage / this.totalPages) * 100);
      pageInfoEl.textContent = `Page ${this.currentPage} / ${this.totalPages} (${percentage}%)`;
    }
  }

  /**
   * Extract text from a specific page
   * @param {number} pageNum - Page number
   * @returns {Promise<string>} Extracted text
   */
  async extractPageText(pageNum) {
    if (!this.pdfDoc) return '';
    
    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      return textContent.items.map(item => item.str).join(' ');
    } catch (error) {
      console.error('Error extracting text:', error);
      return '';
    }
  }

  /**
   * Get PDF metadata
   * @returns {Promise<Object>} PDF metadata
   */
  async getMetadata() {
    if (!this.pdfDoc) return null;
    
    try {
      const metadata = await this.pdfDoc.getMetadata();
      return {
        title: metadata.info?.Title || 'Untitled PDF',
        author: metadata.info?.Author || 'Unknown',
        subject: metadata.info?.Subject || '',
        creator: metadata.info?.Creator || '',
        producer: metadata.info?.Producer || '',
        creationDate: metadata.info?.CreationDate || '',
        pages: this.totalPages
      };
    } catch (error) {
      console.error('Error getting metadata:', error);
      return {
        title: 'Untitled PDF',
        author: 'Unknown',
        pages: this.totalPages
      };
    }
  }

  /**
   * Try to extract table of contents (outline)
   * @returns {Promise<Array>} TOC items
   */
  async getOutline() {
    if (!this.pdfDoc) return [];
    
    try {
      const outline = await this.pdfDoc.getOutline();
      if (!outline) return [];
      
      // Convert outline to flat structure
      const tocItems = [];
      const processOutlineItems = (items, level = 1) => {
        for (const item of items) {
          tocItems.push({
            title: item.title,
            level: level,
            dest: item.dest,
            items: item.items || []
          });
          if (item.items && item.items.length > 0) {
            processOutlineItems(item.items, level + 1);
          }
        }
      };
      
      processOutlineItems(outline);
      return tocItems;
    } catch (error) {
      console.error('Error getting outline:', error);
      return [];
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
    this.currentPage = 1;
    this.totalPages = 0;
    this.searchMatches = [];
    this.currentSearchIndex = -1;
  }
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PDFViewer;
}
