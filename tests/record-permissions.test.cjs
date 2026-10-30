const {test}=require('node:test'),assert=require('node:assert/strict');
test('shared company-role contracts separate roster administration, finance and ordinary record edits',async()=>{
 const {recordWritePermission,mayWriteRecord,mayAssignCrew}=await import('../public/record-permissions.js');
 for(const role of ['owner','admin']){assert.equal(mayWriteRecord(role,'crew'),true);assert.equal(mayWriteRecord(role,'payments'),true);assert.equal(mayAssignCrew(role),true)}
 assert.equal(mayWriteRecord('member','jobs'),true);assert.equal(mayWriteRecord('member','crew'),false);assert.equal(mayWriteRecord('member','jobCosts'),false);assert.equal(mayAssignCrew('member'),false);
 for(const role of ['viewer','project-manager','field','Owner',null]){assert.equal(mayWriteRecord(role,'jobs'),false);assert.equal(mayAssignCrew(role),false)}
 assert.equal(recordWritePermission('crew'),'records:crew:write');assert.equal(recordWritePermission('payments'),'records:finance:write');assert.equal(recordWritePermission('jobs'),'records:write');assert.throws(()=>recordWritePermission('memberships'));
});
