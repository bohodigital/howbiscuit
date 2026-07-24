const ID=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ZIP=/^\d{5}$/;
const PERIOD=/^\d{4}(?:-\d{2})?$/;

export function normalizeHud(record,type){
  if(!ZIP.test(String(record.zip))||!String(record.geoid)||!['county','cbsa'].includes(type)) throw new Error('invalid-hud-record');
  const ratio=Number(record.res_ratio);
  if(!Number.isFinite(ratio)||ratio<0||ratio>1) throw new Error('invalid-hud-ratio');
  return {id:`hud-${record.zip}-${type}`,zip:String(record.zip),geographyType:type,geographyId:String(record.geoid),city:String(record.city),state:String(record.state),residentialRatio:ratio,sourceId:'hud-usps-crosswalk'};
}

export function normalizeEia({seriesId,geographyId,period,value,unit,frequency='monthly'}){
  if(!ID.test(seriesId)||!PERIOD.test(period)||!Number.isFinite(Number(value))||!unit) throw new Error('invalid-eia-record');
  return {id:`eia-${seriesId}-${period}`,seriesId,geographyId,period,value:Number(value),unit,frequency,sourceId:'eia-weekly-gasoline'};
}

export function normalizeFdc(record){
  if(!Number.isInteger(Number(record.fdcId))||!record.description||!record.dataType) throw new Error('invalid-fdc-record');
  return {id:`fdc-${record.fdcId}`,fdcId:Number(record.fdcId),description:String(record.description),dataType:String(record.dataType),sourceId:'usda-fooddata-central'};
}

export function normalizeMmn(record){
  if(!record.reportId||!record.title||!record.unitBasis) throw new Error('invalid-mmn-record');
  return {...record,id:`mmn-${record.reportId}`,sourceId:'usda-mymarketnews'};
}

export function normalizeNass(record){
  const suppressed=record.value===null||['(D)','(Z)','(NA)'].includes(record.value);
  const value=suppressed?null:Number(String(record.value).replaceAll(',',''));
  if(!record.commodity||!PERIOD.test(String(record.period))||(!suppressed&&!Number.isFinite(value))) throw new Error('invalid-nass-record');
  return {id:`nass-${String(record.commodity).toLowerCase()}-${record.period}`,commodity:String(record.commodity).toLowerCase(),statistic:String(record.statistic||'production').toLowerCase(),geography:String(record.geography||'US'),period:String(record.period),value,unit:String(record.unit),suppressed,sourceRevisionAt:record.loadTime??null,sourceId:'usda-nass-quickstats'};
}

export function normalizeKrogerMapping(record){
  if(!ID.test(record.canonicalProductId)||!record.merchantProductId||record.approved!==true||!record.identityEvidence) throw new Error('invalid-kroger-mapping');
  if(!['exact-retailer-sku','exact-gtin'].includes(record.matchConfidence)) throw new Error('probable-mapping-rejected');
  return {...record,id:`kroger-${record.canonicalProductId}`,merchantId:'kroger',sourceId:'kroger'};
}
