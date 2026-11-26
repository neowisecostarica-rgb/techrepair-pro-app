import { jsPDF } from 'jspdf';

export function exportExecutiveReport(report, definitions, perspective) {
  if (!report?.metrics || !report.generated_at || !Array.isArray(report.limitations)) throw new Error('Informe no confirmado');
  const pdf = new jsPDF();
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const fmt = (value, kind) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('es-CR', { maximumFractionDigits: kind === 'money' ? 2 : 0 }).replace(/\u00a0|\u202f/g, ' ') : 'No disponible';
  let y = 0;
  function header() {
    pdf.setFillColor(11,20,34); pdf.rect(0,0,width,34,'F');
    pdf.setTextColor(125,211,197); pdf.setFontSize(9); pdf.text('TRP / EXECUTIVE INTELLIGENCE',15,12);
    pdf.setTextColor(255,255,255); pdf.setFontSize(20); pdf.text('Informe ejecutivo',15,25);
    pdf.setTextColor(25,40,55); y=44;
  }
  function space(n) { if(y+n>height-20){pdf.addPage();header();} }
  function paragraph(text) {
    const lines=pdf.splitTextToSize(String(text),width-30);
    for(const line of lines){space(6);pdf.text(line,15,y);y+=5;}
  }
  header();pdf.setFontSize(10);
  paragraph('Perspectiva: '+perspective+' | Periodo móvil: '+report.days+' día(s)');
  paragraph('Generado: '+report.generated_at+' (UTC)');
  paragraph('Ámbito: '+(report.branch_id?'Sucursal '+report.branch_id:'Organización consolidada'));
  y+=4;
  for(const [key,label,kind,section] of definitions.filter(d=>perspective==='General'||d[3]===perspective)){
    const item=report.metrics[key];const pair=item!==null&&typeof item==='object';
    space(21);pdf.setFillColor(241,245,249);pdf.roundedRect(15,y-5,width-30,18,2,2,'F');
    pdf.setFontSize(10);pdf.setTextColor(25,40,55);pdf.text(label,19,y);
    pdf.setFontSize(11);pdf.text(fmt(pair?item.current:item,kind),width-19,y,{align:'right'});
    pdf.setFontSize(8);pdf.text(pair?'Periodo anterior: '+fmt(item.previous,kind):'Estado actual, no histórico',19,y+7);y+=22;
  }
  space(15);pdf.setFontSize(11);pdf.text('Alcance y limitaciones',15,y);y+=7;pdf.setFontSize(9);
  for(const note of report.limitations) paragraph(note);
  for(let i=1;i<=pdf.getNumberOfPages();i++){pdf.setPage(i);pdf.setFontSize(8);pdf.setTextColor(100,116,139);pdf.text('Uso interno · '+i+' / '+pdf.getNumberOfPages(),15,height-9);}
  pdf.save('TRP-informe-ejecutivo-'+report.generated_at.slice(0,10)+'.pdf');
}
