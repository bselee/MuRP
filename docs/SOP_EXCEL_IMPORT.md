# SOP Excel Import Format

## Overview
The SOP Settings Panel supports importing SOPs from Excel files (.xlsx, .xls) with a flexible column mapping system.

## Supported Columns
The import function automatically detects columns by trying multiple possible names (case-insensitive):

### Required Columns
- **Title** (or: title, SOP Title, Name) - The SOP title
- **Content** (or: content, Procedure, Steps, Instructions) - The full SOP content

### Optional Columns
- **Description** (or: description, Summary, Overview) - Brief description
- **Category** (or: category, Type) - Must match: Manufacturing, Quality Control, Safety, Packaging, Maintenance, Setup, Troubleshooting, Training, Compliance, Other
- **Difficulty** (or: difficulty, Level) - Must be: beginner, intermediate, advanced, expert
- **Time** (or: time, Duration, estimatedTimeMinutes) - Estimated time in minutes (number)
- **Tags** (or: tags, Keywords) - Comma-separated list of tags
- **Status** (or: status) - Must be: draft, published, archived

## Example Excel Format

| Title | Description | Category | Content | Difficulty | Time | Tags | Status |
|-------|-------------|----------|---------|------------|------|------|--------|
| Machine Setup | How to set up CNC machine | Manufacturing | 1. Power on machine\n2. Load program\n3. Set coordinates | intermediate | 15 | setup,cnc | draft |
| Safety Check | Daily safety inspection | Safety | 1. Check guards\n2. Verify E-stops\n3. Inspect cords | beginner | 10 | safety,daily | published |

## Import Process
1. Click "Import" button in SOP Settings Panel
2. Select "Import Excel" option
3. Choose your Excel file
4. The system will:
   - Parse all rows
   - Validate required fields
   - Map columns automatically
   - Skip invalid rows
   - Import valid SOPs to database
   - Show success/error counts

## Error Handling
- Rows missing Title or Content are skipped
- Invalid categories default to "Other"
- Invalid difficulties default to "intermediate"
- Invalid status defaults to "draft"
- Import continues even if some rows fail
- Final report shows success and error counts

## Tips
- Use clear, descriptive column headers
- Ensure Content column has detailed procedures
- Use consistent category names
- Test with a small file first
- Review imported SOPs for accuracy</content>
<parameter name="filePath">/workspaces/TGF-MRP/docs/SOP_EXCEL_IMPORT.md