const { query, queryOne } = require('../src/config/database');
const taskModel = require('../src/models/taskModel');
const projectModel = require('../src/models/projectModel');
const templateModel = require('../src/models/templateModel');

async function test() {
  console.log('Testing Cost & Gantt backend implementations...');

  // 1. Check project financial stats
  const projects = await projectModel.listProjects({ limit: 10, offset: 0, isAdmin: true });
  console.log(`Listed ${projects.rows.length} projects.`);
  const firstProject = projects.rows[0];
  console.log(`Project: ${firstProject.name} (Code: ${firstProject.code})`);
  console.log(`  Budget: Rp ${firstProject.budget.toLocaleString('id-ID')}`);
  console.log(`  Actual Cost: Rp ${firstProject.actual_cost.toLocaleString('id-ID')}`);
  console.log(`  Total Estimated Cost: Rp ${firstProject.total_estimated_cost.toLocaleString('id-ID')}`);

  const stats = await projectModel.getProjectStats(firstProject.id);
  console.log('Project Stats Financials:', {
    budget: stats.budget,
    total_estimated_cost: stats.total_estimated_cost,
    total_task_actual_cost: stats.total_task_actual_cost,
    total_direct_expenses: stats.total_direct_expenses,
    total_expenses: stats.total_expenses,
    actual_cost: stats.actual_cost,
    remaining_budget: stats.remaining_budget,
    budget_usage_percent: stats.budget_usage_percent,
  });

  // 2. Check project expenses
  const expenses = await projectModel.listProjectExpenses(firstProject.id);
  console.log(`Expenses found for project ${firstProject.id}: ${expenses.length}`);
  const summaryByCategory = await projectModel.getExpenseSummaryByCategory(firstProject.id);
  console.log('Expense summary by category:', summaryByCategory);

  // 3. Test expense CRUD
  const newExpenseId = await projectModel.createProjectExpense(
    firstProject.id,
    {
      title: 'Uji Coba Pengeluaran Server Cloud',
      category: 'operational',
      amount: 1500000,
      expense_date: '2026-10-26',
      vendor_name: 'AWS',
      receipt_note: 'Nota uji coba',
    },
    1
  );
  console.log(`Created test expense id: ${newExpenseId}`);

  const fetched = await projectModel.findExpenseById(newExpenseId);
  console.log(`Fetched expense: ${fetched.title}, Amount: ${fetched.amount}`);

  await projectModel.updateProjectExpense(firstProject.id, newExpenseId, {
    amount: 1750000,
    receipt_note: 'Nota revisi',
  });
  const updatedExpense = await projectModel.findExpenseById(newExpenseId);
  console.log(`Updated expense amount: ${updatedExpense.amount}`);

  await projectModel.deleteProjectExpense(firstProject.id, newExpenseId);
  const deleted = await projectModel.findExpenseById(newExpenseId);
  console.log(`Deleted successfully: ${deleted === null}`);

  // 4. Test Gantt data query
  const ganttData = await taskModel.getGanttData(firstProject.id);
  console.log('Gantt Data summary:');
  console.log(`  Tasks: ${ganttData.tasks.length}`);
  console.log(`  Milestones: ${ganttData.milestones.length}`);
  console.log(`  Dependencies: ${ganttData.dependencies.length}`);
  if (ganttData.tasks.length > 0) {
    const t0 = ganttData.tasks[0];
    console.log(`  Sample task: "${t0.title}" start=${t0.start_date} due=${t0.due_date} est_cost=${t0.estimated_cost} act_cost=${t0.actual_cost}`);
  }
  if (ganttData.dependencies.length > 0) {
    const d0 = ganttData.dependencies[0];
    console.log(`  Sample dependency: ${d0.task_title} -> ${d0.depends_on_title} (type=${d0.type}, lag_days=${d0.lag_days})`);
  }

  // 5. Check template task cost copying
  const templates = await templateModel.listTemplates();
  console.log(`Templates found: ${templates.length}`);
  if (templates.length > 0) {
    const tDetail = await templateModel.findTemplateById(templates[0].id);
    console.log(`Template "${tDetail.name}" has ${tDetail.tasks.length} tasks.`);
    if (tDetail.tasks.length > 0) {
      console.log(`  Sample template task: "${tDetail.tasks[0].title}" estimated_cost=${tDetail.tasks[0].estimated_cost}`);
    }
  }

  console.log('All backend checks PASSED successfully!');
  process.exit(0);
}

test().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

