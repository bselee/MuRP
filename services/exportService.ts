/**
 * Triggers a file download in the browser.
 * @param blob The data blob to download.
 * @param filename The desired name of the file.
 */
function triggerDownload(blob: Blob, filename: string) {
    const link = document.createElement('a');
    // Check for download attribute support
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

/**
 * Exports an array of objects to a CSV file.
 * @param data The data to export.
 * @param filename The name of the output file.
 */
export function exportToCsv<T extends object>(data: T[], filename: string) {
    if (data.length === 0) {
        console.warn("No data to export for CSV.");
        return;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','), // header row
        ...data.map(row => 
            headers.map(fieldName => {
                const value = (row as any)[fieldName];
                const stringValue = value === null || value === undefined ? '' : String(value);
                // Escape commas, quotes, and newlines
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            }).join(',')
        )
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename);
}

/**
 * Exports an array of objects to a JSON file.
 * @param data The data to export.
 * @param filename The name of the output file.
 */
export function exportToJson<T extends object>(data: T[], filename: string) {
    if (data.length === 0) {
        console.warn("No data to export for JSON.");
        return;
    }
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    triggerDownload(blob, filename);
}

/**
 * Exports an array of objects to an Excel-compatible file (TSV format with .xls extension).
 * @param data The data to export.
 * @param filename The name of the output file.
 */
export function exportToXls<T extends object>(data: T[], filename: string) {
    if (data.length === 0) {
        console.warn("No data to export for Excel.");
        return;
    }
    
    // Using Tab-Separated Values (TSV) is often more reliable for direct opening in Excel
    const headers = Object.keys(data[0]);
    const tsvRows = [
        headers.join('\t'),
        ...data.map(row =>
            headers.map(fieldName => {
                const value = (row as any)[fieldName];
                const stringValue = value === null || value === undefined ? '' : String(value);
                // Remove tabs and newlines from data to avoid breaking the format
                return stringValue.replace(/\t|\n|\r/g, ' ');
            }).join('\t')
        )
    ];
    
    const tsvString = tsvRows.join('\n');
    // Using a specific BOM and MIME type for better Excel compatibility with UTF-8
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + tsvString], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    triggerDownload(blob, filename);
}
