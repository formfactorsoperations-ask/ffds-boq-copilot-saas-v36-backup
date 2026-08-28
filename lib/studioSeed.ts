import { Observation } from '../types';

// ============================================================================
// SEED — Form Factors' own history, imported from 7 completed projects in
// Zoho Books (accrual basis, exported 2 Aug 2026). Every project reconciles
// exactly to its vendor transactions.
//
//   revenue  Rs 81,73,712   cost  Rs 55,89,214   blended margin  31.6%
//   cost mix subcontract 59.5% | material 22.7% | labour 15.8%
//
// Generated file — do not hand-edit. `confidence: 'measured'` because these
// came from the books, not from memory.
// ============================================================================

export const SEED_SOURCE = 'Zoho Books · 7 projects · exported 02 Aug 2026';

export const SEED_OBSERVATIONS: Observation[] = [
  {
    "projectId": "ZP1",
    "dims": {},
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "actual": 1428262,
    "source": "historical",
    "type": "margin_realised",
    "id": "seed-m-ZP1",
    "at": 0,
    "quoted": 2112292,
    "confidence": "measured"
  },
  {
    "at": 0,
    "type": "margin_realised",
    "dims": {},
    "confidence": "measured",
    "source": "historical",
    "actual": 1230935.07,
    "id": "seed-m-ZP2",
    "projectId": "ZP2",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "quoted": 1663831.47
  },
  {
    "id": "seed-m-ZP3",
    "projectId": "ZP3",
    "quoted": 1299558.52,
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "at": 0,
    "confidence": "measured",
    "type": "margin_realised",
    "dims": {},
    "source": "historical",
    "actual": 861520
  },
  {
    "actual": 661406,
    "source": "historical",
    "dims": {},
    "type": "margin_realised",
    "confidence": "measured",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "id": "seed-m-ZP4",
    "quoted": 1116940,
    "projectId": "ZP4",
    "at": 0
  },
  {
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee",
    "source": "historical",
    "actual": 633005.04,
    "dims": {},
    "type": "margin_realised",
    "at": 0,
    "confidence": "measured",
    "id": "seed-m-ZP5",
    "quoted": 830121,
    "projectId": "ZP5"
  },
  {
    "actual": 413060.02,
    "source": "historical",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "confidence": "measured",
    "dims": {},
    "quoted": 757976,
    "type": "margin_realised",
    "id": "seed-m-ZP6",
    "projectId": "ZP6",
    "at": 0
  },
  {
    "projectId": "ZP7",
    "quoted": 392993,
    "confidence": "measured",
    "id": "seed-m-ZP7",
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "dims": {},
    "at": 0,
    "type": "margin_realised",
    "actual": 361026.4,
    "source": "historical"
  },
  {
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "dims": {
      "vendorName": "Adarsh Vishwakarma",
      "costType": "uncategorised"
    },
    "type": "rate_actual",
    "confidence": "measured",
    "id": "seed-s-ZP1-0",
    "projectId": "ZP1",
    "actual": 25000,
    "source": "historical",
    "note": "Job Costing",
    "at": 1770681600000
  },
  {
    "at": 1771459200000,
    "note": "Subcontractor",
    "confidence": "measured",
    "source": "historical",
    "actual": 82500,
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "id": "seed-s-ZP1-1",
    "type": "rate_actual",
    "dims": {
      "vendorName": "False Ceiling POP - Ganesh",
      "costType": "subcontract"
    },
    "projectId": "ZP1"
  },
  {
    "type": "rate_actual",
    "at": 1773100800000,
    "dims": {
      "costType": "labour",
      "vendorName": "Hasan Electrician"
    },
    "projectId": "ZP1",
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "id": "seed-s-ZP1-2",
    "confidence": "measured",
    "actual": 56500,
    "source": "historical",
    "note": "Labor"
  },
  {
    "dims": {
      "costType": "labour",
      "vendorName": "Sunil Carpenter"
    },
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "type": "rate_actual",
    "projectId": "ZP1",
    "actual": 269450,
    "source": "historical",
    "confidence": "measured",
    "id": "seed-s-ZP1-3",
    "at": 1773100800000,
    "note": "Labor"
  },
  {
    "actual": 37946,
    "source": "historical",
    "type": "rate_actual",
    "at": 1773100800000,
    "dims": {
      "costType": "material",
      "vendorName": "Ganesha Interio - Hardware"
    },
    "id": "seed-s-ZP1-4",
    "projectId": "ZP1",
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "confidence": "measured",
    "note": "Materials"
  },
  {
    "actual": 151427,
    "source": "historical",
    "note": "Materials",
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "confidence": "measured",
    "at": 1773100800000,
    "projectId": "ZP1",
    "dims": {
      "costType": "material",
      "vendorName": "Estillo Doors"
    },
    "id": "seed-s-ZP1-5",
    "type": "rate_actual"
  },
  {
    "note": "Subcontractor",
    "id": "seed-s-ZP1-6",
    "projectId": "ZP1",
    "at": 1773100800000,
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "type": "rate_actual",
    "confidence": "measured",
    "dims": {
      "vendorName": "Kitchen Contractor - Umesh Navkar",
      "costType": "subcontract"
    },
    "actual": 300000,
    "source": "historical"
  },
  {
    "note": "Materials",
    "at": 1774742400000,
    "id": "seed-s-ZP1-7",
    "projectId": "ZP1",
    "actual": 122151,
    "source": "historical",
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "type": "rate_actual",
    "confidence": "measured",
    "dims": {
      "costType": "material",
      "vendorName": "Estillo Doors"
    }
  },
  {
    "dims": {
      "vendorName": "Ganesha Interio - Hardware",
      "costType": "material"
    },
    "type": "rate_actual",
    "confidence": "measured",
    "projectId": "ZP1",
    "at": 1774828800000,
    "source": "historical",
    "actual": 12686,
    "id": "seed-s-ZP1-8",
    "note": "Materials",
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai"
  },
  {
    "note": "Materials",
    "at": 1775692800000,
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "confidence": "measured",
    "id": "seed-s-ZP1-9",
    "source": "historical",
    "actual": 12682,
    "projectId": "ZP1",
    "type": "rate_actual",
    "dims": {
      "vendorName": "MH Glass, Almas",
      "costType": "material"
    }
  },
  {
    "id": "seed-s-ZP1-10",
    "confidence": "measured",
    "type": "rate_actual",
    "at": 1775865600000,
    "dims": {
      "costType": "material",
      "vendorName": "Sunil Carpenter"
    },
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "note": "Materials",
    "actual": 22000,
    "source": "historical",
    "projectId": "ZP1"
  },
  {
    "id": "seed-s-ZP1-11",
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "confidence": "measured",
    "note": "Materials",
    "at": 1776816000000,
    "actual": 43950,
    "source": "historical",
    "type": "rate_actual",
    "dims": {
      "costType": "material",
      "vendorName": "MH Glass, Almas"
    },
    "projectId": "ZP1"
  },
  {
    "type": "rate_actual",
    "dims": {
      "vendorName": "Poonam Hardware",
      "costType": "material"
    },
    "at": 1777075200000,
    "id": "seed-s-ZP1-12",
    "confidence": "measured",
    "projectId": "ZP1",
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "actual": 15000,
    "source": "historical",
    "note": "Materials"
  },
  {
    "type": "rate_actual",
    "at": 1777334400000,
    "dims": {
      "costType": "subcontract",
      "vendorName": "Civil Contractor - Valya"
    },
    "actual": 189700,
    "source": "historical",
    "id": "seed-s-ZP1-13",
    "confidence": "measured",
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "projectId": "ZP1",
    "note": "Subcontractor"
  },
  {
    "actual": 35550,
    "source": "historical",
    "dims": {
      "vendorName": "Klara Curtains & Wallpapers",
      "costType": "subcontract"
    },
    "type": "rate_actual",
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "confidence": "measured",
    "at": 1777334400000,
    "projectId": "ZP1",
    "id": "seed-s-ZP1-14",
    "note": "Subcontractor"
  },
  {
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "note": "Materials",
    "actual": 31600,
    "source": "historical",
    "id": "seed-s-ZP1-15",
    "dims": {
      "vendorName": "MH Glass, Almas",
      "costType": "material"
    },
    "projectId": "ZP1",
    "at": 1777507200000,
    "type": "rate_actual",
    "confidence": "measured"
  },
  {
    "note": "Subcontractor",
    "projectId": "ZP1",
    "source": "historical",
    "actual": 10000,
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "confidence": "measured",
    "id": "seed-s-ZP1-16",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Harishankar Polishwala"
    },
    "at": 1778112000000,
    "type": "rate_actual"
  },
  {
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "note": "Materials",
    "dims": {
      "costType": "material",
      "vendorName": "Sunil Carpenter"
    },
    "source": "historical",
    "actual": 5120,
    "type": "rate_actual",
    "id": "seed-s-ZP1-17",
    "projectId": "ZP1",
    "at": 1778198400000,
    "confidence": "measured"
  },
  {
    "confidence": "measured",
    "dims": {
      "costType": "material",
      "vendorName": "Sunil Carpenter"
    },
    "actual": 5000,
    "source": "historical",
    "type": "rate_actual",
    "projectName": "Prestige Gardens Siesta - B3901 - Mr. Achyut Pai",
    "projectId": "ZP1",
    "note": "Materials",
    "id": "seed-s-ZP1-18",
    "at": 1778457600000
  },
  {
    "type": "rate_actual",
    "at": 1759795200000,
    "dims": {
      "vendorName": "Royal Furnishings - Rajesh Jain",
      "costType": "uncategorised"
    },
    "projectId": "ZP2",
    "id": "seed-s-ZP2-0",
    "confidence": "measured",
    "actual": 60000,
    "source": "historical",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Cost of Goods Sold"
  },
  {
    "source": "historical",
    "actual": 23000,
    "confidence": "measured",
    "id": "seed-s-ZP2-1",
    "type": "rate_actual",
    "at": 1762819200000,
    "dims": {
      "costType": "uncategorised",
      "vendorName": "Royal Furnishings - Rajesh Jain"
    },
    "note": "Cost of Goods Sold",
    "projectId": "ZP2",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil"
  },
  {
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "dims": {
      "vendorName": "Carpenter - Afroz",
      "costType": "labour"
    },
    "type": "rate_actual",
    "projectId": "ZP2",
    "at": 1762905600000,
    "id": "seed-s-ZP2-2",
    "confidence": "measured",
    "actual": 73200,
    "source": "historical",
    "note": "Labor"
  },
  {
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "at": 1763596800000,
    "type": "rate_actual",
    "id": "seed-s-ZP2-3",
    "projectId": "ZP2",
    "confidence": "measured",
    "dims": {
      "costType": "material",
      "vendorName": "Estillo Doors"
    },
    "note": "Materials",
    "source": "historical",
    "actual": 43695
  },
  {
    "confidence": "measured",
    "projectId": "ZP2",
    "source": "historical",
    "actual": 13700,
    "note": "Materials",
    "dims": {
      "costType": "material",
      "vendorName": "Estillo Doors"
    },
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "at": 1763596800000,
    "type": "rate_actual",
    "id": "seed-s-ZP2-4"
  },
  {
    "note": "Materials",
    "projectId": "ZP2",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "at": 1763596800000,
    "confidence": "measured",
    "actual": 8496,
    "source": "historical",
    "dims": {
      "costType": "material",
      "vendorName": "Ganesha Interio - Hardware"
    },
    "id": "seed-s-ZP2-5",
    "type": "rate_actual"
  },
  {
    "source": "historical",
    "confidence": "measured",
    "actual": 4305,
    "dims": {
      "vendorName": "Shivstar Electricals - Chotu",
      "costType": "material"
    },
    "type": "rate_actual",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Materials",
    "id": "seed-s-ZP2-6",
    "projectId": "ZP2",
    "at": 1764028800000
  },
  {
    "note": "Subcontractor",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "at": 1764115200000,
    "id": "seed-s-ZP2-7",
    "confidence": "measured",
    "source": "historical",
    "actual": 33817.5,
    "projectId": "ZP2",
    "type": "rate_actual",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Riyaz POP"
    }
  },
  {
    "dims": {
      "costType": "subcontract",
      "vendorName": "Civil Contractor - Valya"
    },
    "source": "historical",
    "actual": 59200.04,
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "type": "rate_actual",
    "at": 1764115200000,
    "note": "Subcontractor",
    "confidence": "measured",
    "id": "seed-s-ZP2-8",
    "projectId": "ZP2"
  },
  {
    "note": "Subcontractor",
    "id": "seed-s-ZP2-9",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "projectId": "ZP2",
    "source": "historical",
    "actual": 24950,
    "at": 1764115200000,
    "type": "rate_actual",
    "confidence": "measured",
    "dims": {
      "vendorName": "Hasan Electrician",
      "costType": "subcontract"
    }
  },
  {
    "projectId": "ZP2",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Materials",
    "confidence": "measured",
    "id": "seed-s-ZP2-10",
    "dims": {
      "costType": "material",
      "vendorName": "Micro Lights"
    },
    "type": "rate_actual",
    "at": 1764374400000,
    "actual": 14000,
    "source": "historical"
  },
  {
    "note": "Materials",
    "actual": 7000,
    "source": "historical",
    "id": "seed-s-ZP2-11",
    "dims": {
      "vendorName": "Estillo Doors",
      "costType": "material"
    },
    "projectId": "ZP2",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "at": 1764892800000,
    "confidence": "measured",
    "type": "rate_actual"
  },
  {
    "source": "historical",
    "actual": 26923,
    "note": "Materials",
    "dims": {
      "costType": "material",
      "vendorName": "Micro Lights"
    },
    "projectId": "ZP2",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "type": "rate_actual",
    "id": "seed-s-ZP2-12",
    "at": 1765065600000,
    "confidence": "measured"
  },
  {
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Labor",
    "confidence": "measured",
    "projectId": "ZP2",
    "id": "seed-s-ZP2-13",
    "source": "historical",
    "actual": 15300,
    "dims": {
      "vendorName": "Carpenter - Afroz",
      "costType": "labour"
    },
    "at": 1766016000000,
    "type": "rate_actual"
  },
  {
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Materials",
    "id": "seed-s-ZP2-14",
    "dims": {
      "vendorName": "Zoom Lights",
      "costType": "material"
    },
    "type": "rate_actual",
    "source": "historical",
    "actual": 10993,
    "projectId": "ZP2",
    "confidence": "measured",
    "at": 1766016000000
  },
  {
    "source": "historical",
    "actual": 62509.48,
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Materials",
    "confidence": "measured",
    "dims": {
      "costType": "material",
      "vendorName": "Estillo Doors"
    },
    "type": "rate_actual",
    "id": "seed-s-ZP2-15",
    "projectId": "ZP2",
    "at": 1766102400000
  },
  {
    "note": "Subcontractor",
    "projectId": "ZP2",
    "actual": 95400,
    "source": "historical",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "at": 1766188800000,
    "dims": {
      "costType": "subcontract",
      "vendorName": "Carpenter - Afroz"
    },
    "id": "seed-s-ZP2-16",
    "confidence": "measured",
    "type": "rate_actual"
  },
  {
    "dims": {
      "vendorName": "Ganesha Interio - Hardware",
      "costType": "material"
    },
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "type": "rate_actual",
    "actual": 7148,
    "source": "historical",
    "at": 1766361600000,
    "projectId": "ZP2",
    "confidence": "measured",
    "id": "seed-s-ZP2-17",
    "note": "Materials"
  },
  {
    "at": 1767052800000,
    "projectId": "ZP2",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Materials",
    "confidence": "measured",
    "id": "seed-s-ZP2-18",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Micro Lights",
      "costType": "material"
    },
    "actual": 16643,
    "source": "historical"
  },
  {
    "actual": 10850,
    "source": "historical",
    "confidence": "measured",
    "id": "seed-s-ZP2-19",
    "type": "rate_actual",
    "at": 1767052800000,
    "projectId": "ZP2",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Hasan Electrician"
    },
    "note": "Subcontractor",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil"
  },
  {
    "confidence": "measured",
    "source": "historical",
    "actual": 49469.73,
    "projectId": "ZP2",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Materials",
    "dims": {
      "vendorName": "Estillo Doors",
      "costType": "material"
    },
    "type": "rate_actual",
    "id": "seed-s-ZP2-20",
    "at": 1767398400000
  },
  {
    "note": "Materials",
    "id": "seed-s-ZP2-21",
    "confidence": "measured",
    "actual": 9000,
    "source": "historical",
    "at": 1767398400000,
    "projectId": "ZP2",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "type": "rate_actual",
    "dims": {
      "costType": "material",
      "vendorName": "Estillo Doors"
    }
  },
  {
    "at": 1767398400000,
    "note": "Materials",
    "confidence": "measured",
    "id": "seed-s-ZP2-22",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "projectId": "ZP2",
    "source": "historical",
    "actual": 8400,
    "type": "rate_actual",
    "dims": {
      "vendorName": "Estillo Doors",
      "costType": "material"
    }
  },
  {
    "source": "historical",
    "actual": 14979,
    "at": 1767398400000,
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "type": "rate_actual",
    "confidence": "measured",
    "id": "seed-s-ZP2-23",
    "dims": {
      "vendorName": "Estillo Doors",
      "costType": "material"
    },
    "note": "Materials",
    "projectId": "ZP2"
  },
  {
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "confidence": "measured",
    "projectId": "ZP2",
    "note": "Materials",
    "actual": 14000,
    "source": "historical",
    "id": "seed-s-ZP2-24",
    "dims": {
      "vendorName": "Suresh Prajapati Profile Glass",
      "costType": "material"
    },
    "type": "rate_actual",
    "at": 1767744000000
  },
  {
    "at": 1767916800000,
    "note": "Materials",
    "projectId": "ZP2",
    "id": "seed-s-ZP2-25",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "type": "rate_actual",
    "confidence": "measured",
    "dims": {
      "vendorName": "Estillo Doors",
      "costType": "material"
    },
    "actual": 12780,
    "source": "historical"
  },
  {
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Subcontractor",
    "id": "seed-s-ZP2-26",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Hasan Electrician"
    },
    "source": "historical",
    "actual": 30326,
    "type": "rate_actual",
    "projectId": "ZP2",
    "confidence": "measured",
    "at": 1768262400000
  },
  {
    "dims": {
      "costType": "subcontract",
      "vendorName": "Carpenter - Afroz"
    },
    "type": "rate_actual",
    "confidence": "measured",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "at": 1768262400000,
    "projectId": "ZP2",
    "source": "historical",
    "actual": 200900,
    "id": "seed-s-ZP2-27",
    "note": "Subcontractor"
  },
  {
    "source": "historical",
    "actual": 42886,
    "confidence": "measured",
    "at": 1768435200000,
    "projectId": "ZP2",
    "id": "seed-s-ZP2-28",
    "type": "rate_actual",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Civil Contractor - Valya"
    },
    "note": "Subcontractor",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil"
  },
  {
    "confidence": "measured",
    "projectId": "ZP2",
    "note": "Materials",
    "source": "historical",
    "actual": 10500,
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "at": 1768521600000,
    "id": "seed-s-ZP2-29",
    "dims": {
      "vendorName": "Parshwaa Glass & Ply",
      "costType": "material"
    },
    "type": "rate_actual"
  },
  {
    "id": "seed-s-ZP2-30",
    "type": "rate_actual",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Riyaz POP"
    },
    "at": 1768521600000,
    "note": "Subcontractor",
    "actual": 24290,
    "confidence": "measured",
    "source": "historical",
    "projectId": "ZP2",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil"
  },
  {
    "note": "Subcontractor",
    "id": "seed-s-ZP2-31",
    "projectId": "ZP2",
    "at": 1768867200000,
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "actual": 5500,
    "source": "historical",
    "confidence": "measured",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Indian Handlooms",
      "costType": "subcontract"
    }
  },
  {
    "id": "seed-s-ZP2-32",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "projectId": "ZP2",
    "note": "Materials",
    "at": 1770249600000,
    "type": "rate_actual",
    "dims": {
      "vendorName": "Concept Hardware",
      "costType": "material"
    },
    "confidence": "measured",
    "actual": 15593.32,
    "source": "historical"
  },
  {
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "source": "historical",
    "actual": 75505,
    "projectId": "ZP2",
    "note": "Materials",
    "dims": {
      "costType": "material",
      "vendorName": "Estillo Doors"
    },
    "type": "rate_actual",
    "id": "seed-s-ZP2-33",
    "at": 1770249600000,
    "confidence": "measured"
  },
  {
    "note": "Materials",
    "source": "historical",
    "actual": 8837,
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "id": "seed-s-ZP2-34",
    "dims": {
      "vendorName": "Poonam Hardware",
      "costType": "material"
    },
    "at": 1770595200000,
    "type": "rate_actual",
    "confidence": "measured",
    "projectId": "ZP2"
  },
  {
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Materials",
    "confidence": "measured",
    "dims": {
      "vendorName": "MH Glass, Almas",
      "costType": "material"
    },
    "id": "seed-s-ZP2-35",
    "type": "rate_actual",
    "source": "historical",
    "actual": 4000,
    "projectId": "ZP2",
    "at": 1770681600000
  },
  {
    "type": "rate_actual",
    "confidence": "measured",
    "id": "seed-s-ZP2-36",
    "dims": {
      "costType": "material",
      "vendorName": "Ganesha Interio - Hardware"
    },
    "projectId": "ZP2",
    "at": 1770768000000,
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Materials",
    "actual": 29357,
    "source": "historical"
  },
  {
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "note": "Subcontractor",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Ganesh Bhandari"
    },
    "id": "seed-s-ZP2-37",
    "projectId": "ZP2",
    "actual": 6500,
    "source": "historical",
    "type": "rate_actual",
    "at": 1770854400000,
    "confidence": "measured"
  },
  {
    "id": "seed-s-ZP2-38",
    "note": "Subcontractor",
    "confidence": "measured",
    "source": "historical",
    "actual": 51082,
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "projectId": "ZP2",
    "at": 1771027200000,
    "type": "rate_actual",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Civil Contractor - Valya"
    }
  },
  {
    "projectId": "ZP2",
    "at": 1779062400000,
    "note": "Labor",
    "confidence": "measured",
    "actual": 5900,
    "source": "historical",
    "id": "seed-s-ZP2-39",
    "projectName": "Office Furniture - Renovation - Mr. Shailesh Patil",
    "type": "rate_actual",
    "dims": {
      "costType": "labour",
      "vendorName": "Civil Contractor - Valya"
    }
  },
  {
    "actual": 82500,
    "source": "historical",
    "type": "rate_actual",
    "at": 1744070400000,
    "dims": {
      "vendorName": "Carpenter - Afroz",
      "costType": "subcontract"
    },
    "id": "seed-s-ZP3-0",
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "confidence": "measured",
    "note": "Subcontractor",
    "projectId": "ZP3"
  },
  {
    "type": "rate_actual",
    "confidence": "measured",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Civil Contractor - Valya"
    },
    "id": "seed-s-ZP3-1",
    "at": 1744070400000,
    "note": "Subcontractor",
    "source": "historical",
    "actual": 76420,
    "projectId": "ZP3",
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation"
  },
  {
    "id": "seed-s-ZP3-2",
    "type": "rate_actual",
    "projectId": "ZP3",
    "confidence": "measured",
    "dims": {
      "vendorName": "False Ceiling POP - Ganesh",
      "costType": "subcontract"
    },
    "at": 1745020800000,
    "note": "Subcontractor",
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "actual": 31750,
    "source": "historical"
  },
  {
    "source": "historical",
    "at": 1745452800000,
    "actual": 7510,
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "projectId": "ZP3",
    "type": "rate_actual",
    "id": "seed-s-ZP3-3",
    "dims": {
      "costType": "material",
      "vendorName": "Shivstar Electricals - Chotu"
    },
    "note": "Materials",
    "confidence": "measured"
  },
  {
    "note": "Subcontractor",
    "projectId": "ZP3",
    "at": 1746921600000,
    "actual": 87000,
    "source": "historical",
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "confidence": "measured",
    "dims": {
      "vendorName": "Carpenter - Afroz",
      "costType": "subcontract"
    },
    "id": "seed-s-ZP3-4",
    "type": "rate_actual"
  },
  {
    "actual": 244500,
    "source": "historical",
    "note": "Subcontractor",
    "projectId": "ZP3",
    "dims": {
      "vendorName": "Jitesh Dewasi BNI",
      "costType": "subcontract"
    },
    "at": 1747267200000,
    "type": "rate_actual",
    "confidence": "measured",
    "id": "seed-s-ZP3-5",
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation"
  },
  {
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "id": "seed-s-ZP3-6",
    "note": "Subcontractor",
    "at": 1747267200000,
    "projectId": "ZP3",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Civil Contractor - Valya",
      "costType": "subcontract"
    },
    "confidence": "measured",
    "source": "historical",
    "actual": 55000
  },
  {
    "note": "Subcontractor",
    "confidence": "measured",
    "id": "seed-s-ZP3-7",
    "projectId": "ZP3",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Hasan Electrician"
    },
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "type": "rate_actual",
    "at": 1747699200000,
    "source": "historical",
    "actual": 21350
  },
  {
    "note": "Subcontractor",
    "id": "seed-s-ZP3-8",
    "at": 1748908800000,
    "source": "historical",
    "actual": 195880,
    "confidence": "measured",
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Civil Contractor - Valya",
      "costType": "subcontract"
    },
    "projectId": "ZP3"
  },
  {
    "dims": {
      "costType": "subcontract",
      "vendorName": "Estillo Doors"
    },
    "type": "rate_actual",
    "confidence": "measured",
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "projectId": "ZP3",
    "id": "seed-s-ZP3-9",
    "source": "historical",
    "actual": 15700,
    "note": "Subcontractor",
    "at": 1749772800000
  },
  {
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "dims": {
      "vendorName": "Manish Lohar CNC Cutting",
      "costType": "subcontract"
    },
    "type": "rate_actual",
    "confidence": "measured",
    "actual": 3000,
    "source": "historical",
    "projectId": "ZP3",
    "at": 1750118400000,
    "id": "seed-s-ZP3-10",
    "note": "Subcontractor"
  },
  {
    "confidence": "measured",
    "note": "Subcontractor",
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "projectId": "ZP3",
    "at": 1751068800000,
    "dims": {
      "vendorName": "Hasan Electrician",
      "costType": "subcontract"
    },
    "id": "seed-s-ZP3-11",
    "type": "rate_actual",
    "source": "historical",
    "actual": 15100
  },
  {
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Civil Contractor - Valya"
    },
    "source": "historical",
    "actual": 22810,
    "type": "rate_actual",
    "at": 1751241600000,
    "note": "Subcontractor",
    "confidence": "measured",
    "projectId": "ZP3",
    "id": "seed-s-ZP3-12"
  },
  {
    "note": "Subcontractor",
    "confidence": "measured",
    "actual": 3000,
    "source": "historical",
    "projectId": "ZP3",
    "projectName": "Mrs. Swati - Runwal Eirene - 2BHK - Renovation",
    "id": "seed-s-ZP3-13",
    "dims": {
      "vendorName": "Carpenter - Afroz",
      "costType": "subcontract"
    },
    "type": "rate_actual",
    "at": 1752624000000
  },
  {
    "note": "Subcontractor",
    "at": 1778112000000,
    "projectId": "ZP4",
    "source": "historical",
    "actual": 31295,
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "confidence": "measured",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Rajesh Yadav - Marble Polish"
    },
    "id": "seed-s-ZP4-0",
    "type": "rate_actual"
  },
  {
    "projectId": "ZP4",
    "note": "Subcontractor",
    "confidence": "measured",
    "id": "seed-s-ZP4-1",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Rahul Kumar - Painter"
    },
    "type": "rate_actual",
    "actual": 82000,
    "source": "historical",
    "at": 1778198400000
  },
  {
    "projectId": "ZP4",
    "at": 1778716800000,
    "confidence": "measured",
    "note": "Materials",
    "actual": 68120,
    "source": "historical",
    "id": "seed-s-ZP4-2",
    "type": "rate_actual",
    "dims": {
      "costType": "material",
      "vendorName": "Estillo Doors"
    },
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK"
  },
  {
    "confidence": "measured",
    "dims": {
      "costType": "labour",
      "vendorName": "Sunil Carpenter"
    },
    "type": "rate_actual",
    "projectId": "ZP4",
    "at": 1779062400000,
    "note": "Labor",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "actual": 124500,
    "source": "historical",
    "id": "seed-s-ZP4-3"
  },
  {
    "note": "Materials",
    "at": 1779235200000,
    "source": "historical",
    "actual": 10750,
    "confidence": "measured",
    "id": "seed-s-ZP4-4",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "projectId": "ZP4",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Kites Plywood & Hardware",
      "costType": "material"
    }
  },
  {
    "id": "seed-s-ZP4-5",
    "source": "historical",
    "actual": 3100,
    "note": "Materials",
    "at": 1779926400000,
    "type": "rate_actual",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "dims": {
      "vendorName": "Kites Plywood & Hardware",
      "costType": "material"
    },
    "projectId": "ZP4",
    "confidence": "measured"
  },
  {
    "source": "historical",
    "actual": 146000,
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "dims": {
      "vendorName": "Jitesh Dewasi BNI",
      "costType": "subcontract"
    },
    "type": "rate_actual",
    "projectId": "ZP4",
    "at": 1780272000000,
    "note": "Subcontractor",
    "confidence": "measured",
    "id": "seed-s-ZP4-6"
  },
  {
    "id": "seed-s-ZP4-7",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "note": "Materials",
    "at": 1780444800000,
    "type": "rate_actual",
    "dims": {
      "costType": "material",
      "vendorName": "Kites Plywood & Hardware"
    },
    "projectId": "ZP4",
    "source": "historical",
    "actual": 2900,
    "confidence": "measured"
  },
  {
    "note": "Materials",
    "projectId": "ZP4",
    "at": 1780704000000,
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "source": "historical",
    "actual": 1950,
    "dims": {
      "vendorName": "Kites Plywood & Hardware",
      "costType": "material"
    },
    "confidence": "measured",
    "id": "seed-s-ZP4-8",
    "type": "rate_actual"
  },
  {
    "confidence": "measured",
    "actual": 45000,
    "source": "historical",
    "note": "Subcontractor",
    "dims": {
      "vendorName": "Jitesh Dewasi BNI",
      "costType": "subcontract"
    },
    "type": "rate_actual",
    "id": "seed-s-ZP4-9",
    "at": 1780963200000,
    "projectId": "ZP4",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK"
  },
  {
    "id": "seed-s-ZP4-10",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "type": "rate_actual",
    "at": 1781222400000,
    "dims": {
      "vendorName": "Riyaz POP",
      "costType": "labour"
    },
    "note": "Labor",
    "confidence": "measured",
    "projectId": "ZP4",
    "source": "historical",
    "actual": 7090
  },
  {
    "confidence": "measured",
    "dims": {
      "vendorName": "Poonam Hardware",
      "costType": "material"
    },
    "type": "rate_actual",
    "id": "seed-s-ZP4-11",
    "note": "Materials",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "actual": 6136,
    "source": "historical",
    "at": 1781222400000,
    "projectId": "ZP4"
  },
  {
    "source": "historical",
    "actual": 15500,
    "confidence": "measured",
    "at": 1781481600000,
    "type": "rate_actual",
    "id": "seed-s-ZP4-12",
    "dims": {
      "vendorName": "Kites Plywood & Hardware",
      "costType": "material"
    },
    "note": "Materials",
    "projectId": "ZP4",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK"
  },
  {
    "projectId": "ZP4",
    "source": "historical",
    "actual": 4200,
    "note": "Materials",
    "dims": {
      "costType": "material",
      "vendorName": "Kites Plywood & Hardware"
    },
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "id": "seed-s-ZP4-13",
    "type": "rate_actual",
    "confidence": "measured",
    "at": 1781568000000
  },
  {
    "note": "Materials",
    "id": "seed-s-ZP4-14",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "at": 1781740800000,
    "projectId": "ZP4",
    "type": "rate_actual",
    "confidence": "measured",
    "dims": {
      "costType": "material",
      "vendorName": "Ganesha Interio - Hardware"
    },
    "source": "historical",
    "actual": 15932
  },
  {
    "source": "historical",
    "actual": 25000,
    "at": 1783382400000,
    "confidence": "measured",
    "type": "rate_actual",
    "id": "seed-s-ZP4-15",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Harishankar Polishwala"
    },
    "projectId": "ZP4",
    "note": "Subcontractor",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK"
  },
  {
    "at": 1783555200000,
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "confidence": "measured",
    "note": "Materials",
    "source": "historical",
    "actual": 10696,
    "id": "seed-s-ZP4-16",
    "type": "rate_actual",
    "dims": {
      "costType": "material",
      "vendorName": "Akesha"
    },
    "projectId": "ZP4"
  },
  {
    "at": 1783555200000,
    "projectId": "ZP4",
    "note": "Materials",
    "confidence": "measured",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "source": "historical",
    "id": "seed-s-ZP4-17",
    "actual": 5500,
    "type": "rate_actual",
    "dims": {
      "vendorName": "Estillo Doors",
      "costType": "material"
    }
  },
  {
    "actual": 21500,
    "source": "historical",
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "dims": {
      "vendorName": "Civil Contractor - Valya",
      "costType": "subcontract"
    },
    "type": "rate_actual",
    "note": "Subcontractor",
    "id": "seed-s-ZP4-18",
    "confidence": "measured",
    "at": 1783555200000,
    "projectId": "ZP4"
  },
  {
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "note": "Labor",
    "confidence": "measured",
    "at": 1783900800000,
    "dims": {
      "costType": "labour",
      "vendorName": "Hasan Electrician"
    },
    "type": "rate_actual",
    "source": "historical",
    "actual": 32680,
    "projectId": "ZP4",
    "id": "seed-s-ZP4-19"
  },
  {
    "dims": {
      "costType": "material",
      "vendorName": "Ganesha Interio - Hardware"
    },
    "projectName": "Hiranandani One - Ashwini & Sameer 2BHK",
    "actual": 1557,
    "source": "historical",
    "type": "rate_actual",
    "id": "seed-s-ZP4-20",
    "note": "Materials",
    "projectId": "ZP4",
    "confidence": "measured",
    "at": 1784332800000
  },
  {
    "confidence": "measured",
    "id": "seed-s-ZP5-0",
    "type": "rate_actual",
    "at": 1775001600000,
    "projectId": "ZP5",
    "source": "historical",
    "actual": 244320,
    "dims": {
      "vendorName": "Civil Contractor - Valya",
      "costType": "subcontract"
    },
    "note": "Subcontractor",
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee"
  },
  {
    "at": 1775520000000,
    "confidence": "measured",
    "note": "Labor",
    "projectId": "ZP5",
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee",
    "source": "historical",
    "id": "seed-s-ZP5-1",
    "actual": 154400,
    "type": "rate_actual",
    "dims": {
      "vendorName": "Carpenter - Afroz",
      "costType": "labour"
    }
  },
  {
    "dims": {
      "vendorName": "Carpenter - Afroz",
      "costType": "subcontract"
    },
    "confidence": "measured",
    "type": "rate_actual",
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee",
    "projectId": "ZP5",
    "actual": 51600,
    "source": "historical",
    "id": "seed-s-ZP5-2",
    "note": "Subcontractor",
    "at": 1775520000000
  },
  {
    "projectId": "ZP5",
    "note": "Materials",
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee",
    "id": "seed-s-ZP5-3",
    "at": 1776816000000,
    "source": "historical",
    "actual": 3280,
    "confidence": "measured",
    "type": "rate_actual",
    "dims": {
      "costType": "material",
      "vendorName": "Hasan Electrician"
    }
  },
  {
    "projectId": "ZP5",
    "dims": {
      "vendorName": "Estillo Doors",
      "costType": "material"
    },
    "type": "rate_actual",
    "source": "historical",
    "actual": 21520,
    "at": 1778716800000,
    "note": "Materials",
    "id": "seed-s-ZP5-4",
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee",
    "confidence": "measured"
  },
  {
    "at": 1778716800000,
    "note": "Subcontractor",
    "projectId": "ZP5",
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee",
    "confidence": "measured",
    "id": "seed-s-ZP5-5",
    "type": "rate_actual",
    "actual": 114380.04,
    "source": "historical",
    "dims": {
      "vendorName": "Civil Contractor - Valya",
      "costType": "subcontract"
    }
  },
  {
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee",
    "note": "Subcontractor",
    "actual": 9000,
    "source": "historical",
    "id": "seed-s-ZP5-6",
    "projectId": "ZP5",
    "dims": {
      "costType": "subcontract",
      "vendorName": "False Ceiling POP - Ganesh"
    },
    "confidence": "measured",
    "type": "rate_actual",
    "at": 1779062400000
  },
  {
    "note": "Subcontractor",
    "confidence": "measured",
    "dims": {
      "vendorName": "Harishankar Polishwala",
      "costType": "subcontract"
    },
    "id": "seed-s-ZP5-7",
    "type": "rate_actual",
    "projectId": "ZP5",
    "source": "historical",
    "actual": 7000,
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee",
    "at": 1779753600000
  },
  {
    "type": "rate_actual",
    "dims": {
      "vendorName": "Hasan Electrician",
      "costType": "labour"
    },
    "id": "seed-s-ZP5-8",
    "at": 1780012800000,
    "confidence": "measured",
    "projectId": "ZP5",
    "actual": 16000,
    "source": "historical",
    "note": "Labor",
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee"
  },
  {
    "confidence": "measured",
    "source": "historical",
    "actual": 1900,
    "note": "Labor",
    "at": 1781222400000,
    "dims": {
      "costType": "labour",
      "vendorName": "Hasan Electrician"
    },
    "type": "rate_actual",
    "projectId": "ZP5",
    "id": "seed-s-ZP5-9",
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee"
  },
  {
    "source": "historical",
    "actual": 6505,
    "type": "rate_actual",
    "dims": {
      "costType": "material",
      "vendorName": "Poonam Hardware"
    },
    "id": "seed-s-ZP5-10",
    "at": 1781222400000,
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee",
    "note": "Materials",
    "projectId": "ZP5",
    "confidence": "measured"
  },
  {
    "at": 1783209600000,
    "confidence": "measured",
    "note": "Labor",
    "projectId": "ZP5",
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee",
    "id": "seed-s-ZP5-11",
    "actual": 600,
    "source": "historical",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Hasan Electrician",
      "costType": "labour"
    }
  },
  {
    "id": "seed-s-ZP5-12",
    "at": 1783900800000,
    "type": "rate_actual",
    "dims": {
      "vendorName": "Civil Contractor - Valya",
      "costType": "subcontract"
    },
    "note": "Subcontractor",
    "projectId": "ZP5",
    "confidence": "measured",
    "source": "historical",
    "actual": 2500,
    "projectName": "Lake Pleasant Powai - Mrs. Apurvee"
  },
  {
    "note": "Materials",
    "id": "seed-s-ZP6-0",
    "at": 1757721600000,
    "source": "historical",
    "actual": 78769,
    "confidence": "measured",
    "projectId": "ZP6",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Estillo Doors",
      "costType": "material"
    },
    "projectName": "1BHK Full Home Interiors - Kalwa"
  },
  {
    "projectId": "ZP6",
    "dims": {
      "vendorName": "Upendra Patil",
      "costType": "subcontract"
    },
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "type": "rate_actual",
    "source": "historical",
    "actual": 40700.02,
    "confidence": "measured",
    "at": 1757980800000,
    "note": "Subcontractor",
    "id": "seed-s-ZP6-1"
  },
  {
    "note": "Labor",
    "confidence": "measured",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "id": "seed-s-ZP6-2",
    "source": "historical",
    "actual": 64150,
    "dims": {
      "vendorName": "Carpenter - Dilip",
      "costType": "labour"
    },
    "projectId": "ZP6",
    "type": "rate_actual",
    "at": 1758153600000
  },
  {
    "dims": {
      "costType": "subcontract",
      "vendorName": "False Ceiling POP - Ganesh"
    },
    "type": "rate_actual",
    "confidence": "measured",
    "source": "historical",
    "actual": 13000,
    "projectId": "ZP6",
    "id": "seed-s-ZP6-3",
    "note": "Subcontractor",
    "at": 1758412800000,
    "projectName": "1BHK Full Home Interiors - Kalwa"
  },
  {
    "dims": {
      "vendorName": "Jitesh Dewasi BNI",
      "costType": "subcontract"
    },
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "type": "rate_actual",
    "projectId": "ZP6",
    "id": "seed-s-ZP6-4",
    "source": "historical",
    "actual": 78000,
    "note": "Subcontractor",
    "confidence": "measured",
    "at": 1758499200000
  },
  {
    "actual": 5225,
    "source": "historical",
    "type": "rate_actual",
    "at": 1758585600000,
    "dims": {
      "vendorName": "Hasan Electrician",
      "costType": "material"
    },
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "id": "seed-s-ZP6-5",
    "confidence": "measured",
    "note": "Materials",
    "projectId": "ZP6"
  },
  {
    "actual": 14600,
    "source": "historical",
    "confidence": "measured",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "projectId": "ZP6",
    "note": "Subcontractor",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Hasan Electrician"
    },
    "at": 1758585600000,
    "type": "rate_actual",
    "id": "seed-s-ZP6-6"
  },
  {
    "note": "Materials",
    "id": "seed-s-ZP6-7",
    "source": "historical",
    "actual": 12270,
    "at": 1758931200000,
    "confidence": "measured",
    "type": "rate_actual",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "dims": {
      "costType": "material",
      "vendorName": "Parshwaa Glass & Ply"
    },
    "projectId": "ZP6"
  },
  {
    "note": "Materials",
    "id": "seed-s-ZP6-8",
    "at": 1759104000000,
    "actual": 4500,
    "source": "historical",
    "projectId": "ZP6",
    "confidence": "measured",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Dorby Laminates",
      "costType": "material"
    },
    "projectName": "1BHK Full Home Interiors - Kalwa"
  },
  {
    "note": "Labor",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "source": "historical",
    "actual": 31175,
    "confidence": "measured",
    "projectId": "ZP6",
    "id": "seed-s-ZP6-9",
    "at": 1759276800000,
    "dims": {
      "costType": "labour",
      "vendorName": "Carpenter - Dilip"
    },
    "type": "rate_actual"
  },
  {
    "id": "seed-s-ZP6-10",
    "type": "rate_actual",
    "at": 1759622400000,
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "projectId": "ZP6",
    "dims": {
      "vendorName": "Civil Contractor - Valya",
      "costType": "subcontract"
    },
    "confidence": "measured",
    "note": "Subcontractor",
    "actual": 36500,
    "source": "historical"
  },
  {
    "type": "rate_actual",
    "at": 1759708800000,
    "dims": {
      "vendorName": "Parshwaa Glass & Ply",
      "costType": "material"
    },
    "source": "historical",
    "actual": 1470,
    "projectId": "ZP6",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "id": "seed-s-ZP6-11",
    "confidence": "measured",
    "note": "Materials"
  },
  {
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "dims": {
      "vendorName": "Parshwaa Glass & Ply",
      "costType": "material"
    },
    "type": "rate_actual",
    "confidence": "measured",
    "actual": 1880,
    "source": "historical",
    "id": "seed-s-ZP6-12",
    "projectId": "ZP6",
    "note": "Materials",
    "at": 1759881600000
  },
  {
    "projectId": "ZP6",
    "note": "Materials",
    "source": "historical",
    "actual": 2467,
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "at": 1760054400000,
    "confidence": "measured",
    "dims": {
      "vendorName": "Ganesha Interio - Hardware",
      "costType": "material"
    },
    "type": "rate_actual",
    "id": "seed-s-ZP6-13"
  },
  {
    "source": "historical",
    "actual": 1190,
    "note": "Materials",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "projectId": "ZP6",
    "id": "seed-s-ZP6-14",
    "dims": {
      "vendorName": "Ganesha Interio - Hardware",
      "costType": "material"
    },
    "type": "rate_actual",
    "confidence": "measured",
    "at": 1760054400000
  },
  {
    "id": "seed-s-ZP6-15",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "note": "Materials",
    "actual": 2700,
    "source": "historical",
    "at": 1760140800000,
    "type": "rate_actual",
    "projectId": "ZP6",
    "dims": {
      "vendorName": "Estillo Doors",
      "costType": "material"
    },
    "confidence": "measured"
  },
  {
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "note": "Labor",
    "id": "seed-s-ZP6-16",
    "source": "historical",
    "actual": 4500,
    "projectId": "ZP6",
    "confidence": "measured",
    "dims": {
      "costType": "labour",
      "vendorName": "Carpenter - Dilip"
    },
    "type": "rate_actual",
    "at": 1760659200000
  },
  {
    "note": "Subcontractor",
    "id": "seed-s-ZP6-17",
    "at": 1760659200000,
    "confidence": "measured",
    "projectId": "ZP6",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Carpenter - Dilip",
      "costType": "subcontract"
    },
    "actual": 1000,
    "source": "historical"
  },
  {
    "note": "Materials",
    "id": "seed-s-ZP6-18",
    "projectId": "ZP6",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "actual": 17964,
    "source": "historical",
    "at": 1760832000000,
    "confidence": "measured",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Ganesha Interio - Hardware",
      "costType": "material"
    }
  },
  {
    "projectId": "ZP6",
    "type": "rate_actual",
    "at": 1761609600000,
    "dims": {
      "costType": "subcontract",
      "vendorName": "Hasan Electrician"
    },
    "source": "historical",
    "actual": 1000,
    "confidence": "measured",
    "id": "seed-s-ZP6-19",
    "projectName": "1BHK Full Home Interiors - Kalwa",
    "note": "Subcontractor"
  },
  {
    "type": "rate_actual",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Civil Contractor - Valya"
    },
    "id": "seed-s-ZP7-0",
    "at": 1774396800000,
    "actual": 248250,
    "source": "historical",
    "confidence": "measured",
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "note": "Subcontractor",
    "projectId": "ZP7"
  },
  {
    "confidence": "measured",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Carpenter - Afroz"
    },
    "type": "rate_actual",
    "source": "historical",
    "actual": 20000,
    "projectId": "ZP7",
    "id": "seed-s-ZP7-1",
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "note": "Subcontractor",
    "at": 1775779200000
  },
  {
    "note": "Labor",
    "id": "seed-s-ZP7-2",
    "at": 1776038400000,
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "type": "rate_actual",
    "dims": {
      "vendorName": "Hasan Electrician",
      "costType": "labour"
    },
    "projectId": "ZP7",
    "actual": 24950,
    "source": "historical",
    "confidence": "measured"
  },
  {
    "note": "Subcontractor",
    "projectId": "ZP7",
    "confidence": "measured",
    "actual": 20640,
    "source": "historical",
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "id": "seed-s-ZP7-3",
    "dims": {
      "costType": "subcontract",
      "vendorName": "Riyaz POP"
    },
    "at": 1776124800000,
    "type": "rate_actual"
  },
  {
    "id": "seed-s-ZP7-4",
    "type": "rate_actual",
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "at": 1780617600000,
    "dims": {
      "costType": "subcontract",
      "vendorName": "Riyaz POP"
    },
    "confidence": "measured",
    "note": "Subcontractor",
    "actual": 16290.4,
    "source": "historical",
    "projectId": "ZP7"
  },
  {
    "dims": {
      "costType": "material",
      "vendorName": "Hasan Electrician"
    },
    "actual": 11171,
    "source": "historical",
    "type": "rate_actual",
    "projectId": "ZP7",
    "note": "Materials",
    "id": "seed-s-ZP7-5",
    "confidence": "measured",
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "at": 1781222400000
  },
  {
    "at": 1781222400000,
    "confidence": "measured",
    "type": "rate_actual",
    "source": "historical",
    "actual": 16880,
    "id": "seed-s-ZP7-6",
    "projectId": "ZP7",
    "dims": {
      "costType": "material",
      "vendorName": "Micro Lights"
    },
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "note": "Materials"
  },
  {
    "source": "historical",
    "actual": 600,
    "confidence": "measured",
    "projectId": "ZP7",
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "note": "Materials",
    "dims": {
      "costType": "material",
      "vendorName": "Hasan Electrician"
    },
    "at": 1783814400000,
    "type": "rate_actual",
    "id": "seed-s-ZP7-7"
  },
  {
    "note": "Materials",
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "id": "seed-s-ZP7-8",
    "at": 1784332800000,
    "actual": 1245,
    "source": "historical",
    "confidence": "measured",
    "projectId": "ZP7",
    "type": "rate_actual",
    "dims": {
      "costType": "material",
      "vendorName": "Ganesha Interio - Hardware"
    }
  },
  {
    "dims": {
      "costType": "subcontract",
      "vendorName": "Civil Contractor - Valya"
    },
    "projectName": "2BHK Renovation - Prestige Gardens Harmony - Thane",
    "type": "rate_actual",
    "confidence": "measured",
    "source": "historical",
    "actual": 1000,
    "id": "seed-s-ZP7-9",
    "note": "Subcontractor",
    "projectId": "ZP7",
    "at": 1784678400000
  }
];
