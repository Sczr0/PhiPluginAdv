import fs from 'fs';
import path from 'path';
import { segment } from 'oicq';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// 🌟 全局缓存：启动时预加载，速度起飞！
let cachedSongs = null;
let ratingMap = new Map(); // 定数→歌曲池
let sortedRatings = []; // 排序后的定数列表

export class SelectSongs extends plugin {
  constructor() {
    super({
      name: "随机课题",
      dsc: "帮你随机选三首Phigros课题曲！",
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: "^[#/]随机课题(?:\\s*(\\d+[+-]?))?(?:\\s(EZ|HD|IN|AT|ez|hd|in|at))?(?:\\s(平均|avg))?$",
          fnc: "selectSongs",
        },
        { reg: "^[#/]随机课题帮助$", fnc: "sendHelp" }, // 帮助命令
      ],
    });

    // 🚀 启动加载数据！
    if (!cachedSongs) {
      cachedSongs = this.loadSongs();
      this.buildRatingMap(cachedSongs);
    }
  }

  // 🎵 加载歌曲数据（附带错误保护！）
  loadSongs() {
    try {
      const csvPath = path.join(__dirname, '../phi-plugin/resources/info/difficulty.csv');
      
      // 🚨 如果文件不存在，直接抛错！
      if (!fs.existsSync(csvPath)) {
        throw new Error('PHI_PLUGIN_MISSING'); // 自定义错误码
      }
  
      // 读取CSV文件
      const rows = fs.readFileSync(csvPath, 'utf-8')
        .split('\n')
        .filter(row => row.trim() !== '');
      rows.shift(); // 去掉表头
  
      // 解析歌曲数据
      return rows.map(row => {
        const cols = row.split(',');
        return {
          id: cols[0].trim(),
          EZ: parseFloat(cols[1]) || null,
          HD: parseFloat(cols[2]) || null,
          IN: parseFloat(cols[3]) || null,
          AT: parseFloat(cols[4]) || null,
        };
      }).filter(song => 
        ![song.EZ, song.HD, song.IN, song.AT].every(r => r === null) // 过滤全难度null的歌曲
      );
    } catch (err) {
      if (err.message === 'PHI_PLUGIN_MISSING') {
        console.error('未找到Phi-Plugin定数文件！');
      } else {
        console.error('加载歌曲失败:', err);
      }
      return [];
    }
  }

  // 🌈 构建定数索引
  buildRatingMap(songs) {
    ratingMap.clear();
    for (const song of songs) {
      const key = song.rating;
      if (!ratingMap.has(key)) ratingMap.set(key, []);
      ratingMap.get(key).push(song); // 现在包含完整的difficulty信息
    }
    sortedRatings = [...ratingMap.keys()].sort((a, b) => a - b);
  }

  // 🚀 超速选曲核心！
  // 🌟 超速选曲核心！(改得blingbling的~)
  fastSelectSongs(targetSum, difficulty, isAverage) {
  const sumRange = this.parseRange(targetSum);
  const candidates = [];

  // 🔥 平均模式：三姐妹定数差≤1（现在会优先找同定数啦！）
  if (isAverage) {
    // 智能生成目标定数和（若未指定）
    const [targetMin, targetMax] = this.parseRange(targetSum);
    const targetTotal = targetMin !== 3 
      ? targetMin 
      : Math.floor(Math.random() * 46) + 3; // 3~48随机选一个数

    // 🚀 性能优化三部曲
    // 1. 动态计算允许的定数范围
    const avg = Math.round(targetTotal / 3);
    const minRating = Math.max(1, avg - 2);
    const maxRating = avg + 2;

    // 2. 构建候选池（预过滤+随机采样）
    const candidatePool = [];
    for (let r = minRating; r <= maxRating; r++) {
      const songs = ratingMap.get(r) || [];
      // 随机选取最多15首防止池子过大
      candidatePool.push(...this.pickRandom(songs, 15));
    }

    // 3. 概率优先搜索（最多尝试500次组合）
    let bestMatch = null;
    let closestDiff = Infinity;
    const maxAttempts = 500;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // 随机选取三个不同歌曲
      const combo = this.pickRandom(candidatePool, 3);
      if (combo.length < 3) continue;

      const sum = combo[0].rating + combo[1].rating + combo[2].rating;
      const diff = Math.max(
        Math.abs(combo[0].rating - combo[1].rating),
        Math.abs(combo[0].rating - combo[2].rating),
        Math.abs(combo[1].rating - combo[2].rating)
      );

      // 满足基础条件
      if (diff <= 1 && sum >= targetMin && sum <= targetMax) {
        // 优先选择最接近目标的组合
        const currentDiff = Math.abs(sum - targetTotal);
        if (currentDiff < closestDiff) {
          bestMatch = combo;
          closestDiff = currentDiff;
          // 找到完美匹配立即返回
          if (currentDiff === 0) break;
        }
      }
    }

    if (bestMatch) {
      return {
        success: true,
        songs: bestMatch.map(song => difficulty 
          ? { ...song, difficulty }
          : song
        )
      };
    }
    return { success: false };
  }

    // 🔥 普通模式：数学魔法剪枝
    for (let i = 0; i < sortedRatings.length; i++) {
      const a = sortedRatings[i];
      for (let j = i; j < sortedRatings.length; j++) {
        const b = sortedRatings[j];
        const remaining = sumRange[1] - a - b;
        if (remaining < a) break; // 剪枝：避免重复组合

        // 二分查找第三首歌的定数范围
        const minK = sortedRatings.findIndex(r => r >= (sumRange[0] - a - b));
        const maxK = sortedRatings.findIndex(r => r > remaining);
        const validKs = sortedRatings.slice(minK, maxK === -1 ? undefined : maxK);

        for (const c of validKs) {
          if (a + b + c >= sumRange[0]) {
            candidates.push([a, b, c]);
          }
        }
      }
    }

    // 🎲 随机抽取幸运组合
    if (candidates.length === 0) return { success: false };
    const [a, b, c] = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      success: true,
      songs: (() => {
        const poolA = ratingMap.get(a);
        const poolB = ratingMap.get(b);
        const poolC = ratingMap.get(c);
        
        // 🛡️ 三重保险防重复机制
        let attempts = 0;
        while (attempts++ < 100) { // 最多尝试100次
          const songs = [
            this.pickRandom(poolA, 1)[0],
            this.pickRandom(poolB, 1)[0],
            this.pickRandom(poolC, 1)[0]
          ].filter(Boolean);
          
          // 检查是否重复且定数和正确
          if (new Set(songs.map(s => s.id)).size === 3 
            && songs.reduce((sum, s) => sum + s.rating, 0) === a + b + c) {
            return songs.sort(() => Math.random() - 0.5);
          }
        }
        return []; // 实在找不到就返回空
      })().filter(s => s) // 最后再过滤一次空值
      .sort(() => Math.random() - 0.5) // 打乱顺序
    };
  }

  // 🛠️ 工具函数：从数组随机选n个
  pickRandom(arr, n) {
    return [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
  }

  // 🎯 解析定数范围（支持30+/20-格式）
  parseRange(input) {
    if (!input) return [3, 48]; // 默认全随机
    const str = input.toString().trim();
    
    // 处理纯平均指令（没有数字）
    if (str === '' || isNaN(parseInt(str))) return [3, 48];
  
    // 原有+-逻辑保持不变
    if (str.endsWith('+')) {
      const num = parseInt(str.slice(0, -1)) || 0;
      return [num, Infinity];
    } else if (str.endsWith('-')) {
      const num = parseInt(str.slice(0, -1)) || 0;
      return [0, num];
    }
    const num = parseInt(str);
    return isNaN(num) ? [3, 48] : [num, num];
  }

  // 💬 主逻辑：处理用户指令
  async selectSongs(e) {
    // 🚩 先检查是否加载到歌曲数据
    if (!cachedSongs || cachedSongs.length === 0) {
      const phiPluginPath = path.join(__dirname, '../phi-plugin');
      const isPhiPluginInstalled = fs.existsSync(phiPluginPath);
      
      // 分情况提示！
      let msg = '⚠️ 未找到定数数据！原因：';
      if (!isPhiPluginInstalled) {
        msg += '\n1. 尚未安装【Phi-Plugin】插件~\n' + 
               '👉 安装命令：\n' + 
               'git clone --depth=1 https://github.com/Catrong/phi-plugin.git ./plugins/phi-plugin/ #安装插件本体'
               'cd ./plugins/phi-plugin/ #进入插件目录'
               'pnpm install -P #安装插件所需依赖';
      } else {
        msg += '\n1. Phi-Plugin已安装但缺少difficulty.csv文件\n' + 
               '2. 文件路径应为：plugins/phi-plugin/resources/info/difficulty.csv';
      }
      msg += '\n\n安装后请重启机器人哦～';
      
      e.reply(msg);
      return;
    }
  
    // 🕵️♂️ 正则捕获参数
    const match = e.msg.match(/^[#/]随机课题\s*(\d+[+-]?)?\s*([EZHDINATezhdinat]+)?\s*(平均|avg)?/i);
    const targetSum = match?.[1] || null;
    const difficulty = match?.[2]?.toUpperCase() || null;
    const isAverage = !!match?.[3];
  
    // 🎭 过滤指定难度的歌曲
    const filtered = difficulty
    ? cachedSongs
        .filter(song => song[difficulty] !== null)
        .map(song => ({
          id: song.id,
          rating: Math.floor(song[difficulty]),
          difficulty // 用户指定难度
        }))
    : cachedSongs.flatMap(song => 
        ['EZ', 'HD', 'IN', 'AT']
          .filter(d => song[d] !== null)
          .map(d => ({
            id: song.id,
            rating: Math.floor(song[d]),
            difficulty: d // 保留每个有效难度
          }))
      );
  
    if (filtered.length === 0) {
      e.reply('这个难度没有歌曲哦，换一个试试？');
      return;
    }
  
    // 🚦 重建索引
    this.buildRatingMap(filtered);
  
    // ⚡ 执行筛选
    const result = this.fastSelectSongs(targetSum, difficulty, isAverage);
    if (!result.success) {
      e.reply('没有找到组合，可能条件太严格啦 ~ 或者————你在整活？（笑）');
      return;
    }
  
    // 🎉 构造回复
    const total = result.songs.reduce((sum, s) => sum + s.rating, 0);
    const reply = result.songs.map(s => 
      `◈ ${s.id} [${s.difficulty}] 定数: ${s.rating}`
    ).join('\n');
    e.reply(`🎵 随机课题生成成功！三首曲子请收好～\n${reply}\n✨ 定数总和：${total}`);
  }

  // 📖 帮助命令（图片在此！）
  async sendHelp(e) {
    e.reply([
      "✨ 使用说明：\n" +
      "#随机课题 [定数] [难度] [平均]\n" +
      "例：\n" +
      "#随机课题 30 HD → HD难度总和30\n" +
      "#随机课题 45+ AT 平均 → AT难度总和≥45，三首定数差≤1"
    ]);
  }
}