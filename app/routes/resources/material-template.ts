import * as XLSX from "xlsx";

export async function loader() {
  const headers = [
    "游戏名称",
    "账户名称",
    "描述",
    "使用状态",
    "使用人",
    "使用时间",
  ];
  const data = [headers];
  // 添加示例数据
  data.push([
    "原神",
    "example_account",
    "这是一个示例账号",
    "空闲",
    "admin",
    "2023-10-27 10:00:00",
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="material_import_template.xlsx"',
    },
  });
}
