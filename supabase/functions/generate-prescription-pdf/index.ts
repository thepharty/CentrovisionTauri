import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PrescriptionRequest {
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
}

// Helper function to get doctor title based on gender
function getDoctorTitle(gender?: 'M' | 'F'): string {
  return gender === 'F' ? 'DRA.' : 'DR.';
}

// Base64 encoded header image (encabezado-centrovision.png)
const HEADER_IMAGE_BASE64 = "data:image/png;base64,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";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('[PDF] Solicitud recibida de usuario:', user.id);

    const requestData: PrescriptionRequest = await req.json();
    console.log('[PDF] Tipo de documento:', requestData.type);

    let pdfContent: string;

    if (requestData.type === 'prescription') {
      pdfContent = generatePrescriptionHTML(requestData);
    } else if (requestData.type === 'treatment') {
      pdfContent = generateTreatmentHTML(requestData);
    } else if (requestData.type === 'surgeries') {
      pdfContent = generateSurgeriesHTML(requestData);
    } else if (requestData.type === 'studies') {
      pdfContent = generateStudiesHTML(requestData);
    } else {
      throw new Error('Invalid document type');
    }

    console.log('[PDF] HTML generado exitosamente');

    try {
      const srcMatch = pdfContent.match(/<img src="([^"]+)"/);
      if (srcMatch) {
        console.log('[PDF] Header src (first 100):', srcMatch[1].slice(0, 100));
      }
    } catch (_) {}

    // Return HTML directly as UTF-8 string (JSON handles UTF-8 correctly)
    return new Response(
      JSON.stringify({ 
        success: true, 
        html: pdfContent,
        contentType: 'text/html'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  } catch (error) {
    console.error('[PDF] Error generando documento:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function generatePrescriptionHTML(data: PrescriptionRequest): string {
  const { patientData, doctorData, date, content } = data;
  const { od, os, material, color, type, dp, notes } = content;

  const formatValue = (val: any) => {
    if (val === null || val === undefined || val === '') return '—';
    
    // If it's a numeric field (esfera/cilindro), format with ophthalmological convention
    const num = parseFloat(val);
    if (!isNaN(num)) {
      if (num === 0) return 'PLANO';
      const formatted = Math.abs(num).toFixed(2);
      return num > 0 ? `+${formatted}` : `-${formatted}`;
    }
    
    return val || '—';
  };

  // Format axis values (should be integers without sign or decimals)
  const formatAxis = (val: any) => {
    if (val === null || val === undefined || val === '') return '—';
    
    const num = parseFloat(val);
    if (!isNaN(num)) {
      return Math.round(num).toString();  // Only integer, no sign or decimals
    }
    
    return val || '—';
  };

  // Parse material, color, and type arrays
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
      max-width: 100%;
      height: auto;
      display: block;
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
    
    /* Main prescription container with border */
    .prescription-container {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 12px;
      margin: 10px 0;
      background: #ffffff;
    }
    
    /* Two column layout for prescription and options */
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
    
    /* Eye rows in left column */
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
    
    /* Options columns with vertical divider */
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
    
    /* Bottom row for type and DP */
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
      white-nowrap: nowrap;
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
    
    /* Two column layout for notes and signature */
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
      background: #fafafa;
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
    <img src="${HEADER_IMAGE_BASE64}" alt="Centro Visión" onerror="this.onerror=null; this.src='/encabezado-centrovision.png';" />
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

  <!-- Main prescription container -->
  <div class="prescription-container">
    <!-- Top section: Prescription grid on left, Material/Color on right -->
    <div class="top-section">
      <!-- Left column: OD/OS values -->
      <div class="prescription-column">
        <!-- Column headers -->
        <div class="column-headers">
          <div class="column-header">Esfera</div>
          <div class="column-header">Cilindro</div>
          <div class="column-header">Eje</div>
          <div class="column-header">Adición</div>
        </div>
        
        <div class="eye-row">
          <div class="eye-label">OD</div>
          <div class="value-field">${formatValue(od.esfera)}</div>
          <div class="value-field">${formatValue(od.cilindro)}</div>
          <div class="value-field">${formatAxis(od.eje)}</div>
          <div class="value-field add-field">${formatValue(od.add)}</div>
        </div>
        
        <div class="eye-row">
          <div class="eye-label">OS</div>
          <div class="value-field">${formatValue(os.esfera)}</div>
          <div class="value-field">${formatValue(os.cilindro)}</div>
          <div class="value-field">${formatAxis(os.eje)}</div>
          <div class="value-field add-field">${formatValue(os.add)}</div>
        </div>
      </div>
      
      <!-- Right column: Material and Color with vertical divider -->
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
    
    <!-- Bottom section: Type and DP in one row -->
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

function generateTreatmentHTML(data: PrescriptionRequest): string {
  const { patientData, doctorData, date, content } = data;
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
      min-height: 100vh;
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
    
    .section {
      margin-bottom: 12px;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #fafafa;
    }
    
    .section:last-of-type {
      margin-bottom: 0;
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
      background: #fafafa;
      min-height: 80px;
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
    }
    
    @media print {
      @page {
        margin: 0;
      }
      body {
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
    <img src="${HEADER_IMAGE_BASE64}" alt="Centro Visión" onerror="this.onerror=null; this.src='/encabezado-centrovision.png';">
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

function generateSurgeriesHTML(data: PrescriptionRequest): string {
  const { patientData, doctorData, date, content } = data;
  const { surgeries } = content;

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
      background: #fafafa;
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
    
    
    .footer {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: center;
      padding-top: 10px;
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
    }
    
    @media print {
      @page {
        margin: 0;
      }
      body {
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
    <img src="${HEADER_IMAGE_BASE64}" alt="Centro Visión" onerror="this.onerror=null; this.src='/encabezado-centrovision.png';">
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
          // Eye mapping
          const eyeMap: { [key: string]: string } = {
            'OD': 'Derecho',
            'OS': 'Izquierdo',
            'OU': 'Ambos'
          };
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

function generateStudiesHTML(data: PrescriptionRequest): string {
  const { patientData, doctorData, date, content } = data;
  const { studies } = content;

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
      background: #fafafa;
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
    
    
    .footer {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: center;
      padding-top: 10px;
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
    }
    
    @media print {
      @page {
        margin: 0;
      }
      body {
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
    <img src="${HEADER_IMAGE_BASE64}" alt="Centro Visión" onerror="this.onerror=null; this.src='/encabezado-centrovision.png';">
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
          <th>${(() => {
            // Detect if it's procedures or studies
            const procedimientosKeywords = ['Panfotocoagulacion', 'Laser', 'Iridectomia', 'Capsulotomia', 'Cross Linking', 'Avastin'];
            const isProcedure = studies && studies.length > 0 && studies.some((s: any) => {
              const text = typeof s === 'string' ? s : (s.name || '');
              return procedimientosKeywords.some(kw => text.includes(kw));
            });
            return isProcedure ? 'Procedimiento' : 'Estudio';
          })()}</th>
          <th>Ojo</th>
        </tr>
      </thead>
      <tbody>
        ${studies && studies.length > 0 ? studies.map((s: any) => {
          // Eye mapping
          const eyeMap: { [key: string]: string } = {
            'OD': 'Derecho',
            'OS': 'Izquierdo',
            'OU': 'Ambos'
          };
          
          // If it's an object: { name, eye }
          if (typeof s === 'object' && s !== null && s.name) {
            const eyeDisplay = s.eye ? (eyeMap[s.eye] || s.eye) : '—';
            return `
          <tr>
            <td>${s.name}</td>
            <td>${eyeDisplay}</td>
          </tr>`;
          }
          // If it's a string: "Pentacam OU"
          const match = s.match(/^(.+)\s+(OD|OS|OU)$/);
          if (match) {
            const eyeDisplay = eyeMap[match[2]] || match[2];
            return `
          <tr>
            <td>${match[1].trim()}</td>
            <td>${eyeDisplay}</td>
          </tr>`;
          }
          // Fallback without eye specified
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
