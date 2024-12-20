# PhiPluginAdv
一些bot新功能测试

### 随机课题

#### 命令参数详解

1. **定数范围**：
   - **定义**：定数范围表示所有选择的歌曲整数定数总和的条件。它可以是单一数字、带有 `+` 或 `-` 的数字，表示一个范围条件。
   - **格式**：
     - **单一数字**：例如 `25`，表示定数总和为 25。
     - **带 `+` 的数字**：例如 `25+`，表示定数总和大于等于 25。
     - **带 `-` 的数字**：例如 `25-`，表示定数总和小于等于 25。
   - **默认行为**：如果不指定定数范围，系统会自动生成一个随机范围。

2. **难度筛选**：
   - **定义**：指定选择的歌曲的难度级别。
   - **格式**：
     - 支持的难度有：
       - **EZ** **HD** **IN** **AT**
   - **默认行为**：如果没有指定难度，系统会随机选择所有难度的歌曲。

3. **平均筛选**：
   - **定义**：启用此功能时，会选择三首歌曲，并确保它们的整数定数差距不大于 1。
   - **格式**：
     - 使用 `平均` 或 `avg` 来启用。
     - 例如：`/随机课题 25 平均` 会选择三首整数定数差不超过 1 且总和等于 25 的歌曲。

#### 附注

上述参数均不是必要传入条件，同时/或者#均可。

但传入参数的顺序应当遵循 定数范围 难度筛选 平均筛选。
