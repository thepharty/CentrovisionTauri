// Print Templates - Local HTML generation for offline support
// Converted from Supabase Edge Function to work locally

export interface PrintPDFData {
  type: 'prescription' | 'treatment' | 'surgeries' | 'studies';
  patientData: {
    name: string;
    age: number;
    code: string;
  };
  doctorData: {
    name: string;
    specialty?: string;
    gender?: 'M' | 'F';
  };
  date: string;
  content: any;
  headerImageUrl?: string; // URL del encabezado personalizado de la sede
}

// Cash Closure Data Interface
export interface CashClosureData {
  date: string;
  period: string;
  closedBy: string;
  branchName: string;
  serviceSales: Array<{ service_type: string; cantidad: number; total: number }>;
  inventorySales: Array<{ category: string; cantidad: number; total: number }>;
  paymentMethods: Array<{ payment_method: string; cantidad: number; total: number }>;
  summary: {
    totalInvoiced: number;
    totalCollected: number;
    totalPending: number;
    totalDiscounts: number;
  };
  invoices: Array<{
    invoice_number: string;
    patient_name: string;
    total_amount: number;
    status: string;
    payment_method: string | null;
  }>;
}

// Helper function to get doctor title based on gender
function getDoctorTitle(gender?: 'M' | 'F'): string {
  return gender === 'F' ? 'DRA.' : 'DR.';
}

// Header image path (encabezado-centrovision.png)
const HEADER_IMAGE_PATH = "/encabezado-centrovision.png";

/**
 * Generate HTML content for printing based on document type
 */
export function generatePrintHTML(data: PrintPDFData): string {
  switch (data.type) {
    case 'prescription':
      return generatePrescriptionHTML(data);
    case 'treatment':
      return generateTreatmentHTML(data);
    case 'surgeries':
      return generateSurgeriesHTML(data);
    case 'studies':
      return generateStudiesHTML(data);
    default:
      throw new Error('Invalid document type');
  }
}

function generatePrescriptionHTML(data: PrintPDFData): string {
  const { patientData, doctorData, date, content, headerImageUrl } = data;
  const headerSrc = headerImageUrl || HEADER_IMAGE_PATH;
  const { od, os, material, color, type, dp } = content;

  const formatValue = (val: any) => {
    if (val === null || val === undefined || val === '') return '—';

    const num = parseFloat(val);
    if (!isNaN(num)) {
      if (num === 0) return 'PLANO';
      const formatted = Math.abs(num).toFixed(2);
      return num > 0 ? `+${formatted}` : `-${formatted}`;
    }

    return val || '—';
  };

  const formatAxis = (val: any) => {
    if (val === null || val === undefined || val === '') return '—';

    const num = parseFloat(val);
    if (!isNaN(num)) {
      return Math.round(num).toString();
    }

    return val || '—';
  };

  const materialArray = material ? material.split(', ') : [];
  const colorArray = color ? color.split(', ') : [];
  const typeArray = type ? type.split(', ') : [];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receta Oftalmológica</title>
  <style>
    * {
      box-sizing: border-box;
    }
    @page {
      size: letter;
      margin: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.2;
      color: #1a1a1a;
      margin: 0;
      padding: 15px 30px 15px 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 10px;
    }
    .header img {
      width: 100%;
      max-width: 800px;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      padding: 8px 8px 4px 8px;
      background: white;
      border-radius: 5px;
    }
    .info-block {
      flex: 1;
    }
    .info-label {
      font-weight: 600;
      color: #4F7FFF;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 10pt;
      margin-top: 1px;
    }
    .prescription-container {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 12px;
      margin: 10px 0;
      background: #ffffff;
    }
    .top-section {
      display: flex;
      gap: 20px;
      margin-bottom: 12px;
    }
    .prescription-column {
      flex: 1.8;
      min-width: 0;
      max-width: 600px;
    }
    .options-column-container {
      flex: 1;
      display: flex;
      gap: 0;
      min-width: 0;
      padding-left: 5px;
    }
    .column-headers {
      display: flex;
      gap: 8px;
      margin-bottom: 6px;
      padding-left: 50px;
    }
    .column-header {
      flex: 1;
      text-align: center;
      font-size: 9pt;
      color: #6b7280;
      font-weight: 500;
      min-width: 50px;
    }
    .eye-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .eye-row:last-child {
      margin-bottom: 0;
    }
    .eye-label {
      font-weight: 600;
      font-size: 13pt;
      color: #374151;
      min-width: 40px;
    }
    .value-field {
      flex: 1;
      padding: 6px 8px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      text-align: center;
      font-size: 10pt;
      color: #1f2937;
      min-width: 50px;
      max-width: 90px;
    }
    .value-field.add-field {
      background: #f9fafb;
    }
    .options-column {
      flex: 1;
      padding: 0 16px;
    }
    .options-column:not(:last-child) {
      border-right: 1px solid #e5e7eb;
    }
    .options-column:first-child {
      padding-left: 0;
    }
    .options-column:last-child {
      padding-right: 0;
    }
    .column-title {
      font-weight: 600;
      font-size: 10pt;
      color: #6b7280;
      margin-bottom: 10px;
      text-transform: none;
      letter-spacing: 0;
    }
    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      line-height: 1;
    }
    .checkbox-item:last-child {
      margin-bottom: 0;
    }
    .checkbox {
      width: 16px;
      height: 16px;
      border: 2px solid #d1d5db;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .checkbox.checked {
      background-color: #4F7FFF;
      border-color: #4F7FFF;
    }
    .checkbox.checked::after {
      content: '✓';
      color: white;
      font-size: 12px;
      font-weight: bold;
    }
    .checkbox-label {
      font-size: 10pt;
      color: #1f2937;
      line-height: 1;
      display: flex;
      align-items: center;
    }
    .bottom-section {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
    }
    .type-section {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }
    .type-section .checkbox-item {
      margin-bottom: 0;
    }
    .dp-section {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dp-label {
      font-weight: 600;
      font-size: 10pt;
      color: #374151;
      white-space: nowrap;
    }
    .dp-field {
      padding: 6px 10px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      text-align: center;
      font-size: 10pt;
      color: #1f2937;
      min-width: 50px;
      max-width: 60px;
    }
    .bottom-content {
      display: flex;
      gap: 20px;
      margin: 10px 0 0 0;
    }
    .notes-section {
      flex: 1;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #ffffff;
      min-height: 40px;
    }
    .section-title {
      font-weight: 600;
      font-size: 10pt;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .section-content {
      font-size: 10pt;
      line-height: 1.4;
      color: #1f2937;
    }
    .disclaimer {
      font-size: 7pt;
      color: #6b7280;
      margin-top: 4px;
      font-style: italic;
    }
    .footer {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: center;
      padding-top: 10px;
    }
    .signature-line {
      margin-top: 20px;
      width: 250px;
      text-align: center;
      padding-top: 5px;
    }
    .doctor-info {
      font-size: 10pt;
      color: #555;
    }
    @media print {
      @page {
        margin: 0;
      }
      body {
        padding: 15px 30px 15px 40px;
        margin: 0;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="${headerSrc}" alt="Centro Visión" />
  </div>

  <div class="info-section">
    <div class="info-block">
      <div class="info-label">Paciente</div>
      <div class="info-value">${patientData.name}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Código</div>
      <div class="info-value">${patientData.code || '—'}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Fecha</div>
      <div class="info-value">${date}</div>
    </div>
  </div>

  <div class="prescription-container">
    <div class="top-section">
      <div class="prescription-column">
        <div class="column-headers">
          <div class="column-header">Esfera</div>
          <div class="column-header">Cilindro</div>
          <div class="column-header">Eje</div>
          <div class="column-header">Adición</div>
        </div>

        <div class="eye-row">
          <div class="eye-label">OD</div>
          <div class="value-field">${formatValue(od?.esfera)}</div>
          <div class="value-field">${formatValue(od?.cilindro)}</div>
          <div class="value-field">${formatAxis(od?.eje)}</div>
          <div class="value-field add-field">${formatValue(od?.add)}</div>
        </div>

        <div class="eye-row">
          <div class="eye-label">OS</div>
          <div class="value-field">${formatValue(os?.esfera)}</div>
          <div class="value-field">${formatValue(os?.cilindro)}</div>
          <div class="value-field">${formatAxis(os?.eje)}</div>
          <div class="value-field add-field">${formatValue(os?.add)}</div>
        </div>
      </div>

      <div class="options-column-container">
        <div class="options-column">
          <div class="column-title">Material</div>
          <div class="checkbox-item">
            <div class="checkbox ${materialArray.includes('Vidrio') ? 'checked' : ''}"></div>
            <div class="checkbox-label">Vidrio</div>
          </div>
          <div class="checkbox-item">
            <div class="checkbox ${materialArray.includes('CR-39') ? 'checked' : ''}"></div>
            <div class="checkbox-label">CR-39</div>
          </div>
          <div class="checkbox-item">
            <div class="checkbox ${materialArray.includes('Policarbonato') ? 'checked' : ''}"></div>
            <div class="checkbox-label">Policarbonato</div>
          </div>
        </div>

        <div class="options-column">
          <div class="column-title">Color</div>
          <div class="checkbox-item">
            <div class="checkbox ${colorArray.includes('Blanco') ? 'checked' : ''}"></div>
            <div class="checkbox-label">Blanco</div>
          </div>
          <div class="checkbox-item">
            <div class="checkbox ${colorArray.includes('Transitions') ? 'checked' : ''}"></div>
            <div class="checkbox-label">Transitions</div>
          </div>
          <div class="checkbox-item">
            <div class="checkbox ${colorArray.includes('Antireflejo') ? 'checked' : ''}"></div>
            <div class="checkbox-label">Antireflejo</div>
          </div>
          <div class="checkbox-item">
            <div class="checkbox ${colorArray.includes('Filtro Azul') ? 'checked' : ''}"></div>
            <div class="checkbox-label">Filtro Azul</div>
          </div>
          <div class="checkbox-item">
            <div class="checkbox ${colorArray.some((c: string) => !['Blanco', 'Transitions', 'Antireflejo', 'Filtro Azul'].includes(c)) ? 'checked' : ''}"></div>
            <div class="checkbox-label">Otros: ${colorArray.filter((c: string) => !['Blanco', 'Transitions', 'Antireflejo', 'Filtro Azul'].includes(c)).join(', ') || ''}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="bottom-section">
      <div class="type-section">
        <div class="checkbox-item">
          <div class="checkbox ${typeArray.includes('Lejos') ? 'checked' : ''}"></div>
          <div class="checkbox-label">Lejos</div>
        </div>
        <div class="checkbox-item">
          <div class="checkbox ${typeArray.includes('Cerca') ? 'checked' : ''}"></div>
          <div class="checkbox-label">Cerca</div>
        </div>
        <div class="checkbox-item">
          <div class="checkbox ${typeArray.includes('Progresivo') ? 'checked' : ''}"></div>
          <div class="checkbox-label">Progresivo</div>
        </div>
        <div class="checkbox-item">
          <div class="checkbox ${typeArray.includes('Bifocal') ? 'checked' : ''}"></div>
          <div class="checkbox-label">Bifocal</div>
        </div>
      </div>

      ${dp ? `
      <div class="dp-section">
        <div class="dp-label">Distancia Pupilar</div>
        <div class="dp-field">${dp}</div>
      </div>
      ` : ''}
    </div>
  </div>

  <div class="bottom-content">
    <div style="flex: 1;">
      <div class="notes-section">
        <div class="section-title">Notas Adicionales</div>
        <div class="section-content"></div>
      </div>
      <div class="disclaimer">No nos hacemos responsables por lentes trabajados en otras ópticas</div>
    </div>

    <div class="footer">
      <div class="signature-line">
        <div class="doctor-info">
          <div style="font-weight: 600; font-size: 11pt; margin-bottom: 3px; text-transform: capitalize;">${getDoctorTitle(doctorData.gender)} ${doctorData.name}</div>
          ${doctorData.specialty ? `<div>${doctorData.specialty}</div>` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

function generateTreatmentHTML(data: PrintPDFData): string {
  const { patientData, doctorData, date, content, headerImageUrl } = data;
  const headerSrc = headerImageUrl || HEADER_IMAGE_PATH;
  const { diagnosis, treatment } = content;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Plan de Tratamiento</title>
  <style>
    * {
      box-sizing: border-box;
    }
    @page {
      size: letter;
      margin: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.2;
      color: #1a1a1a;
      margin: 0;
      padding: 15px 30px;
      position: relative;
    }
    .header {
      text-align: center;
      margin-bottom: 10px;
    }
    .header img {
      width: 100%;
      max-width: 800px;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      padding: 8px 8px 4px 8px;
      background: white;
      border-radius: 5px;
    }
    .info-block {
      flex: 1;
    }
    .info-label {
      font-weight: 600;
      color: #4F7FFF;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 10pt;
      margin-top: 1px;
    }
    .content-container {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 12px;
      margin: 10px 0;
      background: #ffffff;
    }
    .section-title {
      font-weight: 600;
      font-size: 10pt;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .section-content {
      font-size: 10pt;
      line-height: 1.4;
      color: #1f2937;
      white-space: pre-wrap;
    }
    .doctor-signature-fixed {
      position: absolute;
      top: 413px;
      right: 80px;
      background: #ffffff;
      padding: 10px 20px;
    }
    .signature-line {
      margin-top: 20px;
      width: 250px;
      text-align: center;
      padding-top: 5px;
    }
    .doctor-info {
      font-size: 10pt;
      color: #555;
      background: #ffffff;
    }
    html, body {
      background: #ffffff !important;
    }
    @media print {
      @page {
        margin: 0;
      }
      html, body {
        background: #ffffff !important;
        padding: 15px 30px;
        margin: 0;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="${headerSrc}" alt="Centro Visión">
  </div>

  <div class="info-section">
    <div class="info-block">
      <div class="info-label">Paciente</div>
      <div class="info-value">${patientData.name}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Código</div>
      <div class="info-value">${patientData.code || '—'}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Fecha</div>
      <div class="info-value">${date}</div>
    </div>
  </div>

  ${diagnosis ? `
  <div class="content-container">
    <div class="section-title">Diagnóstico</div>
    <div class="section-content">${diagnosis}</div>
  </div>
  ` : ''}

  ${treatment ? `
  <div class="content-container">
    <div class="section-title">Indicaciones</div>
    <div class="section-content">${treatment}</div>
  </div>
  ` : ''}

  <div class="doctor-signature-fixed">
    <div class="signature-line">
      <div class="doctor-info">
        <div style="font-weight: 600; font-size: 11pt; margin-bottom: 3px; text-transform: capitalize;">${getDoctorTitle(doctorData.gender)} ${doctorData.name}</div>
        ${doctorData.specialty ? `<div>${doctorData.specialty}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`;
}

function generateSurgeriesHTML(data: PrintPDFData): string {
  const { patientData, doctorData, date, content, headerImageUrl } = data;
  const headerSrc = headerImageUrl || HEADER_IMAGE_PATH;
  const { surgeries } = content;

  const eyeMap: { [key: string]: string } = {
    'OD': 'Derecho',
    'OS': 'Izquierdo',
    'OU': 'Ambos'
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Orden de Cirugía</title>
  <style>
    * {
      box-sizing: border-box;
    }
    @page {
      size: letter;
      margin: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.2;
      color: #1a1a1a;
      margin: 0;
      padding: 15px 30px;
    }
    .header {
      text-align: center;
      margin-bottom: 10px;
    }
    .header img {
      width: 100%;
      max-width: 800px;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      padding: 8px 8px 4px 8px;
      background: white;
      border-radius: 5px;
    }
    .info-block {
      flex: 1;
    }
    .info-label {
      font-weight: 600;
      color: #4F7FFF;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 10pt;
      margin-top: 1px;
    }
    .content-container {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 12px;
      margin: 10px 0;
      background: #ffffff;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border-radius: 8px;
      overflow: hidden;
      margin: 0;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
      font-size: 10pt;
      color: #374151;
    }
    th:first-child {
      border-top-left-radius: 8px;
    }
    th:last-child {
      border-top-right-radius: 8px;
    }
    td {
      font-size: 10pt;
      color: #1f2937;
    }
    tbody tr:last-child td:first-child {
      border-bottom-left-radius: 8px;
    }
    tbody tr:last-child td:last-child {
      border-bottom-right-radius: 8px;
    }
    .bottom-content {
      display: flex;
      gap: 20px;
      margin: 10px 0 0 0;
    }
    .notes-section {
      flex: 1;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #ffffff;
      min-height: 80px;
    }
    .section-title {
      font-weight: 600;
      font-size: 10pt;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .section-content {
      font-size: 10pt;
      line-height: 1.4;
      color: #1f2937;
    }
    .doctor-signature-fixed {
      position: absolute;
      top: 425px;
      right: 80px;
    }
    .signature-line {
      margin-top: 20px;
      width: 250px;
      text-align: center;
      padding-top: 5px;
    }
    .doctor-info {
      font-size: 10pt;
      color: #555;
      background: #ffffff;
    }
    html, body {
      background: #ffffff !important;
    }
    @media print {
      @page {
        margin: 0;
      }
      html, body {
        background: #ffffff !important;
        padding: 15px 30px;
        margin: 0;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="${headerSrc}" alt="Centro Visión">
  </div>

  <div class="info-section">
    <div class="info-block">
      <div class="info-label">Paciente</div>
      <div class="info-value">${patientData.name}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Código</div>
      <div class="info-value">${patientData.code || '—'}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Fecha</div>
      <div class="info-value">${date}</div>
    </div>
  </div>

  <div class="content-container">
    <table>
      <thead>
        <tr>
          <th>Cirugía</th>
          <th>Ojo</th>
        </tr>
      </thead>
      <tbody>
        ${surgeries && surgeries.length > 0 ? surgeries.map((s: any) => {
          const eyeDisplay = s.eye ? (eyeMap[s.eye] || s.eye) : '—';
          return `
          <tr>
            <td>${s.name}</td>
            <td>${eyeDisplay}</td>
          </tr>`;
        }).join('') : '<tr><td colspan="2">No se especificaron cirugías</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="bottom-content">
    <div style="flex: 0 0 50%; max-width: 50%;">
      <div class="notes-section">
        <div class="section-title">Notas Adicionales</div>
        <div class="section-content"></div>
      </div>
    </div>

    <div class="doctor-signature-fixed">
      <div class="signature-line">
        <div class="doctor-info">
          <div style="font-weight: 600; font-size: 11pt; margin-bottom: 3px; text-transform: capitalize;">${getDoctorTitle(doctorData.gender)} ${doctorData.name}</div>
          ${doctorData.specialty ? `<div>${doctorData.specialty}</div>` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

function generateStudiesHTML(data: PrintPDFData): string {
  const { patientData, doctorData, date, content, headerImageUrl } = data;
  const headerSrc = headerImageUrl || HEADER_IMAGE_PATH;
  const { studies } = content;

  const eyeMap: { [key: string]: string } = {
    'OD': 'Derecho',
    'OS': 'Izquierdo',
    'OU': 'Ambos'
  };

  const procedimientosKeywords = ['Panfotocoagulacion', 'Laser', 'Iridectomia', 'Capsulotomia', 'Cross Linking', 'Avastin'];
  const isProcedure = studies && studies.length > 0 && studies.some((s: any) => {
    const text = typeof s === 'string' ? s : (s.name || '');
    return procedimientosKeywords.some(kw => text.includes(kw));
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Orden de Estudios</title>
  <style>
    * {
      box-sizing: border-box;
    }
    @page {
      size: letter;
      margin: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.2;
      color: #1a1a1a;
      margin: 0;
      padding: 15px 30px;
    }
    .header {
      text-align: center;
      margin-bottom: 10px;
    }
    .header img {
      width: 100%;
      max-width: 800px;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      padding: 8px 8px 4px 8px;
      background: white;
      border-radius: 5px;
    }
    .info-block {
      flex: 1;
    }
    .info-label {
      font-weight: 600;
      color: #4F7FFF;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 10pt;
      margin-top: 1px;
    }
    .content-container {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 12px;
      margin: 10px 0;
      background: #ffffff;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border-radius: 8px;
      overflow: hidden;
      margin: 0;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
      font-size: 10pt;
      color: #374151;
    }
    th:first-child {
      border-top-left-radius: 8px;
    }
    th:last-child {
      border-top-right-radius: 8px;
    }
    td {
      font-size: 10pt;
      color: #1f2937;
    }
    tbody tr:last-child td:first-child {
      border-bottom-left-radius: 8px;
    }
    tbody tr:last-child td:last-child {
      border-bottom-right-radius: 8px;
    }
    .bottom-content {
      display: flex;
      gap: 20px;
      margin: 10px 0 0 0;
    }
    .notes-section {
      flex: 1;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #ffffff;
      min-height: 80px;
    }
    .section-title {
      font-weight: 600;
      font-size: 10pt;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .section-content {
      font-size: 10pt;
      line-height: 1.4;
      color: #1f2937;
    }
    .doctor-signature-fixed {
      position: absolute;
      top: 425px;
      right: 80px;
    }
    .signature-line {
      margin-top: 20px;
      width: 250px;
      text-align: center;
      padding-top: 5px;
    }
    .doctor-info {
      font-size: 10pt;
      color: #555;
      background: #ffffff;
    }
    html, body {
      background: #ffffff !important;
    }
    @media print {
      @page {
        margin: 0;
      }
      html, body {
        background: #ffffff !important;
        padding: 15px 30px;
        margin: 0;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="${headerSrc}" alt="Centro Visión">
  </div>

  <div class="info-section">
    <div class="info-block">
      <div class="info-label">Paciente</div>
      <div class="info-value">${patientData.name}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Código</div>
      <div class="info-value">${patientData.code || '—'}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Fecha</div>
      <div class="info-value">${date}</div>
    </div>
  </div>

  <div class="content-container">
    <table>
      <thead>
        <tr>
          <th>${isProcedure ? 'Procedimiento' : 'Estudio'}</th>
          <th>Ojo</th>
        </tr>
      </thead>
      <tbody>
        ${studies && studies.length > 0 ? studies.map((s: any) => {
          if (typeof s === 'object' && s !== null && s.name) {
            const eyeDisplay = s.eye ? (eyeMap[s.eye] || s.eye) : '—';
            return `
          <tr>
            <td>${s.name}</td>
            <td>${eyeDisplay}</td>
          </tr>`;
          }
          const match = typeof s === 'string' ? s.match(/^(.+)\s+(OD|OS|OU)$/) : null;
          if (match) {
            const eyeDisplay = eyeMap[match[2]] || match[2];
            return `
          <tr>
            <td>${match[1].trim()}</td>
            <td>${eyeDisplay}</td>
          </tr>`;
          }
          return `
          <tr>
            <td>${s}</td>
            <td>—</td>
          </tr>`;
        }).join('') : '<tr><td colspan="2">No se especificaron estudios</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="bottom-content">
    <div style="flex: 0 0 50%; max-width: 50%;">
      <div class="notes-section">
        <div class="section-title">Notas Adicionales</div>
        <div class="section-content"></div>
      </div>
    </div>

    <div class="doctor-signature-fixed">
      <div class="signature-line">
        <div class="doctor-info">
          <div style="font-weight: 600; font-size: 11pt; margin-bottom: 3px; text-transform: capitalize;">${getDoctorTitle(doctorData.gender)} ${doctorData.name}</div>
          ${doctorData.specialty ? `<div>${doctorData.specialty}</div>` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Generate HTML for Cash Closure Report
 */
// Consent Signature Data Interface
export interface ConsentSignatureData {
  patientName: string;
  surgeryType: string;
  eyeSide: string;
  date: string;
  consentText: string;
  patientSignature: string; // Base64 PNG
  patientSignedName: string;
  witnessSignature: string; // Base64 PNG
  witnessName: string;
  branchName?: string;
}

/**
 * Generate HTML for Consent Signature Document
 */
export function generateConsentSignatureHTML(data: ConsentSignatureData): string {
  const {
    patientName,
    surgeryType,
    eyeSide,
    date,
    consentText,
    patientSignature,
    patientSignedName,
    witnessSignature,
    witnessName,
    branchName
  } = data;

  const eyeMap: { [key: string]: string } = {
    'OD': 'Ojo Derecho',
    'OS': 'Ojo Izquierdo',
    'OU': 'Ambos Ojos'
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Consentimiento Informado - ${patientName}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    @page {
      size: letter;
      margin: 20mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #1a1a1a;
      background: #ffffff;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #4F7FFF;
    }
    .header h1 {
      font-size: 16pt;
      color: #4F7FFF;
      margin-bottom: 5px;
    }
    .header h2 {
      font-size: 12pt;
      color: #374151;
      font-weight: normal;
    }
    .header-info {
      display: flex;
      justify-content: space-between;
      margin-top: 15px;
      font-size: 10pt;
      color: #555;
    }
    .header-info div {
      text-align: left;
    }
    .header-info strong {
      color: #374151;
    }
    .consent-text {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
      font-size: 9pt;
      line-height: 1.6;
      white-space: pre-wrap;
      max-height: none;
    }
    .signatures-container {
      display: flex;
      justify-content: space-between;
      gap: 40px;
      margin-top: 30px;
    }
    .signature-box {
      flex: 1;
      text-align: center;
    }
    .signature-label {
      font-weight: 600;
      font-size: 10pt;
      color: #374151;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .signature-image {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 10px;
      background: #ffffff;
      min-height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .signature-image img {
      max-width: 100%;
      max-height: 70px;
      object-fit: contain;
    }
    .signature-name {
      margin-top: 8px;
      font-size: 10pt;
      color: #1f2937;
      border-top: 1px solid #374151;
      padding-top: 5px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 8pt;
      color: #6b7280;
    }
    @media print {
      body {
        padding: 0;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>CONSENTIMIENTO INFORMADO</h1>
    <h2>${surgeryType} - ${eyeMap[eyeSide] || eyeSide}</h2>
    <div class="header-info">
      <div><strong>Paciente:</strong> ${patientName}</div>
      <div><strong>Fecha:</strong> ${date}</div>
      ${branchName ? `<div><strong>Sucursal:</strong> ${branchName}</div>` : ''}
    </div>
  </div>

  <div class="consent-text">${consentText}</div>

  <div class="signatures-container">
    <div class="signature-box">
      <div class="signature-label">Firma del Paciente</div>
      <div class="signature-image">
        <img src="${patientSignature}" alt="Firma del paciente" />
      </div>
      <div class="signature-name">${patientSignedName}</div>
    </div>

    <div class="signature-box">
      <div class="signature-label">Firma del Testigo</div>
      <div class="signature-image">
        <img src="${witnessSignature}" alt="Firma del testigo" />
      </div>
      <div class="signature-name">${witnessName}</div>
    </div>
  </div>

  <div class="footer">
    <p>Documento generado electrónicamente por CentroVisión EHR</p>
    <p>Fecha y hora de firma: ${new Date().toLocaleString('es-HN')}</p>
  </div>
</body>
</html>
`;
}

export function generateCashClosureHTML(data: CashClosureData): string {
  const {
    date,
    period,
    closedBy,
    branchName,
    serviceSales,
    inventorySales,
    paymentMethods,
    summary,
    invoices
  } = data;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-HN', {
      style: 'currency',
      currency: 'HNL',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const serviceLabels: { [key: string]: string } = {
    'consulta': 'Consultas',
    'cirugia': 'Cirugías',
    'laser': 'Procedimientos Láser',
    'estudios': 'Estudios',
    'lentes_contacto': 'Lentes de Contacto',
    'inyeccion': 'Inyecciones',
    'otros': 'Otros Servicios'
  };

  const paymentLabels: { [key: string]: string } = {
    'efectivo': 'Efectivo',
    'tarjeta': 'Tarjeta',
    'transferencia': 'Transferencia',
    'cheque': 'Cheque'
  };

  const statusLabels: { [key: string]: string } = {
    'paid': 'Pagado',
    'partial': 'Parcial',
    'pending': 'Pendiente',
    'cancelled': 'Anulado'
  };

  const totalServices = serviceSales.reduce((acc, s) => acc + s.total, 0);
  const totalInventory = inventorySales.reduce((acc, s) => acc + s.total, 0);
  const totalPayments = paymentMethods.reduce((acc, p) => acc + p.total, 0);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Cierre de Caja - ${date}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    @page {
      size: letter;
      margin: 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.3;
      color: #1a1a1a;
      background: #ffffff;
      padding: 10px;
    }
    .header {
      text-align: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #4F7FFF;
    }
    .header h1 {
      font-size: 16pt;
      color: #4F7FFF;
      margin-bottom: 5px;
    }
    .header-info {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 9pt;
      color: #555;
    }
    .section {
      margin-bottom: 12px;
    }
    .section-title {
      font-weight: 600;
      font-size: 10pt;
      color: #4F7FFF;
      margin-bottom: 6px;
      padding-bottom: 3px;
      border-bottom: 1px solid #e5e7eb;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      font-size: 8pt;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 4px 6px;
      text-align: left;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
      font-size: 8pt;
      color: #374151;
    }
    td {
      color: #1f2937;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .total-row {
      font-weight: 600;
      background: #f9fafb;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 15px;
    }
    .summary-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 8px;
      text-align: center;
    }
    .summary-card .label {
      font-size: 7pt;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .summary-card .value {
      font-size: 11pt;
      font-weight: 600;
      color: #1f2937;
      margin-top: 2px;
    }
    .summary-card.primary .value {
      color: #4F7FFF;
    }
    .summary-card.success .value {
      color: #10b981;
    }
    .summary-card.warning .value {
      color: #f59e0b;
    }
    .summary-card.danger .value {
      color: #ef4444;
    }
    .two-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
    .footer {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .signature-box {
      text-align: center;
      width: 200px;
    }
    .signature-line {
      border-top: 1px solid #374151;
      margin-top: 40px;
      padding-top: 5px;
      font-size: 8pt;
      color: #6b7280;
    }
    .status-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 7pt;
      font-weight: 500;
    }
    .status-paid {
      background: #d1fae5;
      color: #065f46;
    }
    .status-partial {
      background: #fef3c7;
      color: #92400e;
    }
    .status-pending {
      background: #fee2e2;
      color: #991b1b;
    }
    .status-cancelled {
      background: #e5e7eb;
      color: #6b7280;
    }
    @media print {
      body {
        padding: 0;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>CIERRE DE CAJA</h1>
    <div class="header-info">
      <span><strong>Sucursal:</strong> ${branchName}</span>
      <span><strong>Fecha:</strong> ${date}</span>
      <span><strong>Período:</strong> ${period}</span>
      <span><strong>Cerrado por:</strong> ${closedBy}</span>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card primary">
      <div class="label">Total Facturado</div>
      <div class="value">${formatCurrency(summary.totalInvoiced)}</div>
    </div>
    <div class="summary-card success">
      <div class="label">Total Cobrado</div>
      <div class="value">${formatCurrency(summary.totalCollected)}</div>
    </div>
    <div class="summary-card warning">
      <div class="label">Pendiente</div>
      <div class="value">${formatCurrency(summary.totalPending)}</div>
    </div>
    <div class="summary-card danger">
      <div class="label">Descuentos</div>
      <div class="value">${formatCurrency(summary.totalDiscounts)}</div>
    </div>
  </div>

  <div class="two-columns">
    <div class="section">
      <div class="section-title">Ventas por Servicio</div>
      <table>
        <thead>
          <tr>
            <th>Servicio</th>
            <th class="text-center">Cant.</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${serviceSales.length > 0 ? serviceSales.map(s => `
          <tr>
            <td>${serviceLabels[s.service_type] || s.service_type}</td>
            <td class="text-center">${s.cantidad}</td>
            <td class="text-right">${formatCurrency(s.total)}</td>
          </tr>
          `).join('') : '<tr><td colspan="3" class="text-center">Sin ventas de servicios</td></tr>'}
          <tr class="total-row">
            <td colspan="2">Subtotal Servicios</td>
            <td class="text-right">${formatCurrency(totalServices)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Ventas de Inventario</div>
      <table>
        <thead>
          <tr>
            <th>Categoría</th>
            <th class="text-center">Cant.</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${inventorySales.length > 0 ? inventorySales.map(s => `
          <tr>
            <td>${s.category}</td>
            <td class="text-center">${s.cantidad}</td>
            <td class="text-right">${formatCurrency(s.total)}</td>
          </tr>
          `).join('') : '<tr><td colspan="3" class="text-center">Sin ventas de inventario</td></tr>'}
          <tr class="total-row">
            <td colspan="2">Subtotal Inventario</td>
            <td class="text-right">${formatCurrency(totalInventory)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Formas de Pago</div>
    <table>
      <thead>
        <tr>
          <th>Método</th>
          <th class="text-center">Transacciones</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${paymentMethods.length > 0 ? paymentMethods.map(p => `
        <tr>
          <td>${paymentLabels[p.payment_method] || p.payment_method}</td>
          <td class="text-center">${p.cantidad}</td>
          <td class="text-right">${formatCurrency(p.total)}</td>
        </tr>
        `).join('') : '<tr><td colspan="3" class="text-center">Sin pagos registrados</td></tr>'}
        <tr class="total-row">
          <td colspan="2">Total Recaudado</td>
          <td class="text-right">${formatCurrency(totalPayments)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Detalle de Facturas (${invoices.length})</div>
    <table>
      <thead>
        <tr>
          <th>Factura</th>
          <th>Paciente</th>
          <th class="text-center">Estado</th>
          <th>Pago</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${invoices.length > 0 ? invoices.map(inv => {
          const statusClass = inv.status === 'paid' ? 'status-paid' :
                              inv.status === 'partial' ? 'status-partial' :
                              inv.status === 'cancelled' ? 'status-cancelled' : 'status-pending';
          return `
        <tr>
          <td>${inv.invoice_number}</td>
          <td>${inv.patient_name}</td>
          <td class="text-center"><span class="status-badge ${statusClass}">${statusLabels[inv.status] || inv.status}</span></td>
          <td>${inv.payment_method ? (paymentLabels[inv.payment_method] || inv.payment_method) : '—'}</td>
          <td class="text-right">${formatCurrency(inv.total_amount)}</td>
        </tr>`;
        }).join('') : '<tr><td colspan="5" class="text-center">Sin facturas</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <div class="signature-box">
      <div class="signature-line">Firma del Cajero</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">Firma del Supervisor</div>
    </div>
  </div>
</body>
</html>
`;
}
