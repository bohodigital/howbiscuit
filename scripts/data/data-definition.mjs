export const RELEASE_ID = 'h3-content-data-2026-07-24';
export const RETRIEVED_AT = '2026-07-24T01:44:18Z';

const hudRows = [
  ['60614','17031','16980','CHICAGO','IL'],['60647','17031','16980','CHICAGO','IL'],
  ['60601','17031','16980','CHICAGO','IL'],['60201','17031','16980','EVANSTON','IL'],
  ['60409','17031','16980','CALUMET CITY','IL'],['46402','18089','16980','GARY','IN'],
  ['46312','18089','16980','EAST CHICAGO','IN'],['46320','18089','16980','HAMMOND','IN'],
  ['46802','18003','23060','FORT WAYNE','IN'],['10001','36061','35620','NEW YORK','NY'],
  ['90012','06037','31080','LOS ANGELES','CA'],['75201','48113','19100','DALLAS','TX'],
  ['77002','48201','26420','HOUSTON','TX'],['30303','13121','12060','ATLANTA','GA'],
  ['85004','04013','38060','PHOENIX','AZ'],['98101','53033','42660','SEATTLE','WA'],
  ['80202','08031','19740','DENVER','CO'],['02108','25025','14460','BOSTON','MA'],
  ['20001','11001','47900','WASHINGTON','DC'],['33130','12086','33100','MIAMI','FL'],
];

export const geographyRelationships = hudRows.flatMap(([zip, county, cbsa, city, state]) => [
  { id:`hud-${zip}-county`, zip, geographyType:'county', geographyId:county, city, state, residentialRatio:1, sourceId:'hud-usps-crosswalk' },
  { id:`hud-${zip}-cbsa`, zip, geographyType:'cbsa', geographyId:cbsa, city, state, residentialRatio:1, sourceId:'hud-usps-crosswalk' },
]);

const energyValues = {
  'electricity-residential-il': [15.78,16.47,17.55,18.28,18.58,18.29,17.22,18.06,19.05,18.74,18.31,17.07,16.36,17.83,18.86,20.47,23.85],
  'electricity-residential-in': [14.55,14.64,16.4,16.89,16.9,16.48,16.18,16.47,17.33,17.34,17.41,15.91,16.19,16.06,17.85,17.9,18.15],
  'electricity-residential-us': [15.94,16.43,17.09,17.55,17.37,17.47,17.45,17.61,18.08,17.97,17.78,17.24,17.45,17.65,18.83,18.83,18.44],
  'natural-gas-residential-il': [8.18,9.22,10.91,13.55,16.28,20.67,22.77,23.18,21.51,15.45,10.56,9.48,9.65,11.4,12.1,14.29],
  'natural-gas-residential-in': [8.85,9.57,11.59,12.66,14.04,27.2,23.21,25.06,22.85,14.86,11.31,10.25,10.03,11.17,12.49,14.45],
  'natural-gas-residential-us': [12.44,12.97,14.62,16.17,19.24,23.26,25.41,26.24,24.7,19.32,15.07,14.09,13.96,15.06,16.25,18.17],
};

const months = Array.from({length:17}, (_, i) => `${i < 12 ? 2025 : 2026}-${String((i % 12)+1).padStart(2,'0')}`);
export const energyObservations = Object.entries(energyValues).flatMap(([seriesId, values]) =>
  values.map((value, index) => ({
    id:`eia-${seriesId}-${months[index]}`, seriesId,
    geographyId:seriesId.endsWith('-il')?'IL':seriesId.endsWith('-in')?'IN':'US',
    period:months[index], value,
    unit:seriesId.startsWith('electricity')?'cents/kWh':'$/MCF',
    frequency:'monthly', sourceId:'eia-weekly-gasoline',
  }))
);

export const foods = [
  [789890,'Flour, wheat, all-purpose, enriched, bleached','Foundation'],
  [746784,'Sugars, granulated','Foundation'],[173468,'Salt, table','SR Legacy'],
  [175040,'Leavening agents, baking soda','SR Legacy'],[172804,'Leavening agents, baking powder','SR Legacy'],
  [173410,'Butter, salted','SR Legacy'],[171413,'Oil, olive, salad or cooking','SR Legacy'],
  [746782,'Milk, whole, 3.25% milkfat, with added vitamin D','Foundation'],
  [171287,'Egg, whole, raw, fresh','SR Legacy'],[168877,'Rice, white, long-grain, regular, raw, enriched','SR Legacy'],
  [173904,'Oats','SR Legacy'],[2758998,'Pasta, spaghetti, dry, enriched','Foundation'],
  [175188,'Beans, black turtle, canned','SR Legacy'],[170051,'Tomatoes, canned, packed in tomato juice','SR Legacy'],
  [169593,'Cocoa, dry powder, unsweetened','SR Legacy'],
].map(([fdcId,description,dataType])=>({id:`fdc-${fdcId}`,fdcId,description,dataType,sourceId:'usda-fooddata-central'}));

export const marketReports = [
  {id:'mmn-1089',title:'Butter - Central U.S.',marketType:'Point of Sale - Dairy',unitBasis:'$/lb basis differential',sourceId:'usda-mymarketnews'},
  {id:'mmn-1100',title:'Fluid Milk and Cream - Central U.S.',marketType:'Point of Sale - Dairy',unitBasis:'$/CWT or $/lb as reported',sourceId:'usda-mymarketnews'},
  {id:'mmn-1427',title:'National Weekly Shell Egg Inventory',marketType:'Inventory',unitBasis:'30-dozen cases in thousands',sourceId:'usda-mymarketnews'},
  {id:'mmn-1655',title:'National Weekly Rice Summary',marketType:'Narrative summary',unitBasis:'qualitative market direction',sourceId:'usda-mymarketnews'},
  {id:'mmn-1662',title:'National Shipping Point Trends Report',marketType:'Shipping point trends',unitBasis:'first-handler F.O.B. methodology',sourceId:'usda-mymarketnews'},
];

export const marketObservations = [
  {id:'mmn-1089-2026-07-20',reportId:'mmn-1089',reportDate:'2026-07-20',commodity:'Butter',geography:'Central U.S.',metric:'AA first-sales basis differential',valueMin:-0.03,valueMax:0.02,unitBasis:'$/lb basis differential',sourceId:'usda-mymarketnews'},
  {id:'mmn-1427-midwest-2026-07-20',reportId:'mmn-1427',reportDate:'2026-07-20',commodity:'Shell eggs',geography:'Midwest',metric:'ungraded inventory',valueMin:237.1,valueMax:237.1,unitBasis:'30-dozen cases in thousands',sourceId:'usda-mymarketnews'},
];

const cropValues = {
  corn:[['2021',15017788000],['2022',13650531000],['2023',15340520000],['2024',14891756000],['2025',17020549000]],
  rice:[['2021',191052000],['2022',160041000],['2023',217991000],['2024',222589000],['2025',206707000]],
  wheat:[['2021',1646254000],['2022',1649713000],['2023',1803942000],['2024',1978697000],['2025',1984537000]],
};
export const agriculturalStatistics = Object.entries(cropValues).flatMap(([commodity, rows]) =>
  rows.map(([period,value])=>({id:`nass-${commodity}-${period}`,commodity,statistic:'production',geography:'US',period,value,unit:commodity==='rice'?'CWT':'BU',suppressed:false,sourceId:'usda-nass-quickstats'}))
);

export const merchantMappings = [
  {id:'kroger-kraft-mac-cheese',canonicalProductId:'kraft-original-mac-cheese-7-25-oz-box-us',merchantId:'kroger',merchantProductId:'0002100065883',matchConfidence:'exact-retailer-sku',identityEvidence:'Reviewed Kroger public product record and retained first-party product source',approved:true,sourceId:'kroger'},
  {id:'kroger-coca-cola-alias',canonicalProductId:'coca-cola-original-12-pack-12-fl-oz-cans-us',merchantId:'kroger',merchantProductId:'0004900002890',matchConfidence:'exact-retailer-sku',identityEvidence:'Approved merchant alias for exact Coca-Cola Original Taste 12 x 12 fl oz can variant; no matcher relaxation',approved:true,sourceId:'kroger'},
];

export const topics = [
  ['chicago-energy-context','Chicago household-energy benchmarks','Explain how Chicago-area electricity and natural-gas benchmarks differ from a bill.',['hud-60614-cbsa','eia-electricity-residential-il-2026-05','eia-natural-gas-residential-il-2026-04']],
  ['northwest-indiana-energy-context','Northwest Indiana energy context','Pair ZIP-to-metro context with Indiana residential energy benchmarks.',['hud-46402-cbsa','eia-electricity-residential-in-2026-05','eia-natural-gas-residential-in-2026-04']],
  ['electricity-il-vs-us','Illinois versus U.S. electricity','Compare official residential electricity series on the same unit and month.',['eia-electricity-residential-il-2026-05','eia-electricity-residential-us-2026-05']],
  ['electricity-in-vs-us','Indiana versus U.S. electricity','Compare official residential electricity series on the same unit and month.',['eia-electricity-residential-in-2026-05','eia-electricity-residential-us-2026-05']],
  ['natural-gas-il-vs-us','Illinois versus U.S. natural gas','Compare official residential natural-gas series on the same unit and month.',['eia-natural-gas-residential-il-2026-04','eia-natural-gas-residential-us-2026-04']],
  ['natural-gas-in-vs-us','Indiana versus U.S. natural gas','Compare official residential natural-gas series on the same unit and month.',['eia-natural-gas-residential-in-2026-04','eia-natural-gas-residential-us-2026-04']],
  ['baking-staples-identities','Baking staple identities','Provide stable USDA food identities for flour, sugar, salt, soda, and powder.',['fdc-789890','fdc-746784','fdc-173468','fdc-175040','fdc-172804']],
  ['dairy-staples-identities','Dairy staple identities','Provide stable USDA food identities for butter, milk, and egg.',['fdc-173410','fdc-746782','fdc-171287']],
  ['pantry-staples-identities','Pantry staple identities','Provide stable USDA food identities for rice, oats, pasta, beans, tomatoes, and cocoa.',['fdc-168877','fdc-173904','fdc-2758998','fdc-175188','fdc-170051','fdc-169593']],
  ['butter-market-basis','Central U.S. butter basis','Explain the reported first-sales basis without treating it as a shelf price.',['mmn-1089','mmn-1089-2026-07-20']],
  ['egg-inventory-context','Midwest egg inventory','Explain the inventory unit and why it is not a consumer price.',['mmn-1427','mmn-1427-midwest-2026-07-20']],
  ['rice-market-context','Rice market context','Pair a USDA weekly market report definition with annual crop production.',['mmn-1655','nass-rice-2025']],
  ['corn-production-trend','U.S. corn production trend','Summarize annual production with year, unit, and revision caveats.',['nass-corn-2021','nass-corn-2022','nass-corn-2023','nass-corn-2024','nass-corn-2025']],
  ['rice-production-trend','U.S. rice production trend','Summarize annual production with year, unit, and revision caveats.',['nass-rice-2021','nass-rice-2022','nass-rice-2023','nass-rice-2024','nass-rice-2025']],
  ['wheat-production-trend','U.S. wheat production trend','Summarize annual production with year, unit, and revision caveats.',['nass-wheat-2021','nass-wheat-2022','nass-wheat-2023','nass-wheat-2024','nass-wheat-2025']],
  ['kroger-exact-mapping','Exact Kroger product mappings','Document the two approved exact merchant mappings and exclusion of probable matches.',['kroger-kraft-mac-cheese','kroger-coca-cola-alias']],
  ['zip-metro-method','ZIP-to-metro method','Explain residential-address weighting using representative national ZIPs.',['hud-60614-cbsa','hud-46802-cbsa','hud-10001-cbsa','hud-90012-cbsa']],
  ['source-boundaries','Six-source claim boundaries','State what each active source may support and what it cannot support.',['hud-60614-county','eia-electricity-residential-us-2026-05','fdc-789890','mmn-1089','nass-corn-2025','kroger-kraft-mac-cheese']],
];

export const sources = {
  'hud-usps-crosswalk': {provider:'HUD USER USPS ZIP Code Crosswalk',retrievedAt:RETRIEVED_AT,url:'https://www.huduser.gov/portal/dataset/uspszip-api.html'},
  'eia-weekly-gasoline': {provider:'U.S. Energy Information Administration',retrievedAt:'2026-07-24T01:35:00Z',url:'https://www.eia.gov/opendata/'},
  'usda-fooddata-central': {provider:'USDA FoodData Central',retrievedAt:'2026-07-24T01:37:00Z',url:'https://fdc.nal.usda.gov/api-guide.html'},
  'usda-mymarketnews': {provider:'USDA MyMarketNews',retrievedAt:'2026-07-24T01:38:00Z',url:'https://mymarketnews.ams.usda.gov/'},
  'usda-nass-quickstats': {provider:'USDA NASS Quick Stats',retrievedAt:'2026-07-24T01:39:00Z',url:'https://quickstats.nass.usda.gov/'},
  kroger: {provider:'Kroger Public APIs',retrievedAt:'2026-07-23T00:00:00Z',url:'https://developer.kroger.com/'},
};
