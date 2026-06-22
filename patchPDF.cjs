const fs = require('fs');

const f = fs.readFileSync('components/RevisionStudio.tsx', 'utf8');

const startIndex = f.indexOf('const exportToPDF = () => {');
const endIndexStr = 'doc.save(`${projectContext?.name || \'Project\'}_Revision_Pack_${new Date().toISOString().split(\'T\')[0]}.pdf`);\n      showToast("PDF Pack generated successfully!");\n    } catch (err) {\n      console.error("Error generating PDF:", err);\n      showToast("Could not generate PDF. Please try again.");\n    }\n  };';
const endIndex = f.indexOf(endIndexStr);

if (startIndex === -1) {
  console.log("Start not found");
  process.exit(1);
}
if(endIndex === -1) {
  console.log("End not found");
  process.exit(1);
}

console.log("Found range:", startIndex, "to", endIndex + endIndexStr.length);
