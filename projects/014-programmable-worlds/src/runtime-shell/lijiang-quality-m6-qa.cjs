'use strict';
// The packaged explicit --lijiang-quality-m6-qa dispatch is the only entry.
if(process.env.LIJIANG_M6_FULL==='1')require('./lijiang-quality-m6-full-qa.cjs');
else{
  if(process.env.LIJIANG_M6_EXPORT==='1'||process.env.LIJIANG_M6_PARENT==='1'||process.env.LIJIANG_M6_FOCUS==='1')throw new Error('M6 preview refuses export/parent/focus flags; choose FULL=1 explicitly');
  require('./lijiang-quality-m6-preview-qa.cjs');
}
