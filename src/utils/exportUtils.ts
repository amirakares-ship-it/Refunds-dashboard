import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { KpiSummary, formatMonthLabel } from './dataProcessor';

/**
 * Export a single page/element to PDF with formatted header and page numbering.
 */
export async function exportSinglePagePdf(
  elementId: string,
  filename: string = 'Refunds_Dashboard_Report.pdf',
  pageTitle: string = 'Refunds Analytics Report',
  isLight: boolean = false
) {
  try {
    const element = document.getElementById(elementId) || document.getElementById('dashboard-content');
    if (!element) {
      alert('Element not found for PDF export.');
      return;
    }

    // Capture element canvas
    const canvas = await html2canvas(element, {
      scale: 1.6,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: isLight ? '#f8fafc' : '#0f172a',
      windowWidth: 1280,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (el) =>
        (el.classList && el.classList.contains('no-pdf')) ||
        (el.tagName === 'BUTTON' && (el.textContent?.includes('Edit') || el.textContent?.includes('Upload') || false)),
    });

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas render failed.');
    }

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = 297;
    const pdfHeight = 210;
    const margin = 5;

    const imgData = canvas.toDataURL('image/png');
    const availableWidth = pdfWidth - margin * 2;
    const availableHeight = pdfHeight - margin * 2 - 8; // Leave space for footer
    const imgHeight = (canvas.height * availableWidth) / canvas.width;

    if (imgHeight <= availableHeight) {
      // Single page fit
      pdf.addImage(imgData, 'PNG', margin, margin, availableWidth, imgHeight);
      
      // Footer
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`Refunds Project Dashboard | ${pageTitle} | Generated: ${new Date().toLocaleString()}`, margin, 204);
      pdf.text('Page 1 of 1', pdfWidth - margin - 20, 204);
    } else {
      // Multi-page scrolling fit
      let heightLeft = imgHeight;
      let position = margin;
      let pageNum = 1;

      pdf.addImage(imgData, 'PNG', margin, position, availableWidth, imgHeight);

      // Add footer for page 1
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`Refunds Project Dashboard | ${pageTitle} | Page ${pageNum}`, margin, 204);

      heightLeft -= availableHeight;

      while (heightLeft > 5) {
        position -= (availableHeight - 5);
        pdf.addPage();
        pageNum++;
        pdf.addImage(imgData, 'PNG', margin, position, availableWidth, imgHeight);

        // Footer
        pdf.setFontSize(8);
        pdf.setTextColor(148, 163, 184);
        pdf.text(`Refunds Project Dashboard | ${pageTitle} | Page ${pageNum}`, margin, 204);

        heightLeft -= availableHeight;
      }
    }

    pdf.save(filename);
  } catch (err) {
    console.error('Single page PDF export error:', err);
    alert('Failed to generate PDF. Please try again.');
  }
}

/**
 * Export all 4 pages combined into a single, multi-page formatted PDF report.
 */
export async function exportAllPagesPdf(
  pages: { id: string; title: string }[],
  filename: string = 'Refunds_Project_Complete_Report.pdf',
  isLight: boolean = false,
  onProgress?: (current: number, total: number) => void
) {
  try {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = 297;
    const pdfHeight = 210;
    const margin = 5;
    const availableWidth = pdfWidth - margin * 2;
    const availableHeight = pdfHeight - margin * 2 - 8;

    let totalPagesCount = pages.length;

    for (let i = 0; i < pages.length; i++) {
      if (onProgress) onProgress(i + 1, totalPagesCount);

      const page = pages[i];
      const element = document.getElementById(page.id);

      if (!element) {
        console.warn(`Element with id ${page.id} not found, skipping.`);
        continue;
      }

      // Capture page element canvas
      const canvas = await html2canvas(element, {
        scale: 1.2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: isLight ? '#ffffff' : '#0f172a',
        windowWidth: 1280,
        scrollX: 0,
        scrollY: 0,
        ignoreElements: (el) =>
          (el.classList && el.classList.contains('no-pdf')) ||
          (el.tagName === 'BUTTON' && (el.textContent?.includes('Edit') || el.textContent?.includes('Upload') || false)),
      });

      if (!canvas || canvas.width === 0 || canvas.height === 0) continue;

      if (i > 0) {
        pdf.addPage();
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.90);
      const imgHeight = (canvas.height * availableWidth) / canvas.width;

      if (imgHeight <= availableHeight) {
        pdf.addImage(imgData, 'JPEG', margin, margin, availableWidth, imgHeight);
      } else {
        pdf.addImage(imgData, 'JPEG', margin, margin, availableWidth, availableHeight);
      }

      // Add Page Footer
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text(
        `Refunds Project Dashboard - Complete Report | ${page.title} | ${new Date().toLocaleDateString()}`,
        margin + 2,
        204
      );
      pdf.text(`Page ${i + 1} of ${totalPagesCount}`, pdfWidth - margin - 22, 204);
    }

    pdf.save(filename);
  } catch (err) {
    console.error('All pages PDF export error:', err);
    alert('Failed to generate full multi-page PDF export.');
  }
}

/**
 * Native Vector PDF Generator Fallback
 */
export async function exportDashboardToPdf(
  elementId: string = 'dashboard-content',
  filename: string = 'Refunds_Dashboard_Report.pdf',
  kpis?: KpiSummary,
  filters?: { company: string; requestMonth: string; status: string; type: string }
) {
  return exportSinglePagePdf(elementId, filename, 'Main Executive Dashboard', false);
}
