import plugin from '../../lib/plugins/plugin.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

// 数据管理类
class DailyData {
  constructor() {
    this.dataDir = path.join(process.cwd(), 'data', 'bingo')
    this.initDataDir()
    
    // 内存数据结构优化
    this.state = {
      date: '',
      correctUsers: new Map(), // 使用Map存储用户ID与时间戳
      hashData: { date: '', imageHash: '', answerHash: '' },
      ranking: new Map()       // 按日期分组的排名数据
    }
    this.resetTimer = null
    this.writeLock = false
  }

  async init() {
    await this.loadPersistentData()
    this.startDailyReset()
  }

  static async create() {
    const instance = new DailyData()
    await instance.init()
    return instance
  }

  initDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
  }

  // 统一数据加载
  async loadPersistentData() {
    try {
      await Promise.all([
        this.loadHashData(),
        this.loadRankingData(),
        this.syncDateState()
      ])
    } catch (e) {
      console.error('[Bingo] 数据加载失败:', e)
      // 添加重试逻辑
    }
  }

  // 优化哈希数据处理
  loadHashData() {
    const filePath = path.join(this.dataDir, 'hashData.json')
    try {
      if (fs.existsSync(filePath)) {
        this.state.hashData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      }
    } catch (e) {
      console.error('[Bingo] 加载哈希数据失败:', e)
    }
  }

  // 排名数据存储优化
  loadRankingData() {
    const filePath = path.join(this.dataDir, 'ranking.json')
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        // 转换格式: {日期 -> [用户ID数组]}
        this.state.ranking = new Map(Object.entries(raw))
      }
    } catch (e) {
      console.error('[Bingo] 加载排名数据失败:', e)
    }
  }

  // 日期状态同步
  syncDateState() {
    const today = this.getToday()
    if (this.state.date !== today) {
      // 日期变化，重置数据
      this.state.date = today
      this.state.correctUsers.clear()
    }

    // 无论日期是否变化，都尝试加载当天的用户数据
    const dailyFile = path.join(this.dataDir, `${today}.users.json`)
    if (fs.existsSync(dailyFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(dailyFile, 'utf-8'))
        this.state.correctUsers = new Map(data.users)
        console.log(`[Bingo] 已加载 ${today} 的用户数据`)
      } catch (e) {
        console.error(`[Bingo] 加载 ${today} 用户数据失败:`, e)
      }
    }
  }

  // 每日重置逻辑优化
  startDailyReset() {
    // 清理已有定时器
    if (this.resetTimer) {
      clearInterval(this.resetTimer)
    }
    
    this.resetTimer = setInterval(() => {
      const today = this.getToday()
      if (this.state.date === today) return
      
      // 持久化昨日数据
      this.persistDailyData(this.state.date)
      
      // 重置状态
      this.state.date = today
      this.state.correctUsers.clear()
      console.log(`[Bingo] 已重置每日统计 ${today}`)
    }, 1000 * 60 * 60 * 24)
  }

  // 数据持久化优化
  async persistDailyData(date) {
    if (this.writeLock) {
      console.log('[Bingo] 数据正在写入中，跳过本次写入')
      return
    }
    
    this.writeLock = true
    try {
      if (!date) return
    
      // 保存正确用户（带时间戳）
      const userFile = path.join(this.dataDir, `${date}.users.json`)
      const userData = {
        users: [...this.state.correctUsers.entries()]  // 保存完整的[userId, timestamp]对
      }
      fs.writeFileSync(userFile, JSON.stringify(userData), 'utf-8')

      // 按时间戳排序存储
      const rankingData = [...this.state.correctUsers.entries()]
        .sort(([, a], [, b]) => a - b)
        .map(([userId]) => userId)
    
      this.state.ranking.set(date, rankingData)
      this.saveRankingData()
    } finally {
      this.writeLock = false
    }
  }

  async retryOperation(operation, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation()
      } catch (e) {
        if (i === maxRetries - 1) throw e
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
  }

  async saveRankingData() {
    await this.retryOperation(async () => {
      const filePath = path.join(this.dataDir, 'ranking.json')
      const data = Object.fromEntries([...this.state.ranking])
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2))
    })
  }

  // 工具方法
  getToday() {
    return new Date().toISOString().split('T')[0]
  }

  // 添加清理方法
  destroy() {
    if (this.resetTimer) {
      clearInterval(this.resetTimer)
      this.resetTimer = null
    }
  }
}

// 初始化数据管理实例
const dataManager = await DailyData.create()

export class BingoPlugin extends plugin {
  constructor() {
    super({
      name: 'Bingo游戏',
      dsc: '每日Bingo挑战插件',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#今日bingo$',
          fnc: 'sendBingoImage'
        },
        {
          reg: '^#bingo\\s+([1-5][1-5]\\s*)+$',
          fnc: 'checkAnswer'
        },
        {
          reg: '^#查询排名$',
          fnc: 'queryRanking'
        }
      ]
    })
  }

  // 获取当日数据路径
  getTodayDataPath() {
    return {
      image: `https://gh.llkk.cc/https://github.com/Sczr0/Daily-Bingo/blob/main/data/blank.png`,
      solution: `https://gh.llkk.cc/https://raw.githubusercontent.com/Sczr0/Daily-Bingo/refs/heads/main/data/solutions.json`
    }
  }

  // 获取解决方案数据
  async fetchSolutions(url) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('数据未找到')
      const data = await response.json()
      return data.solutions
    } catch (e) {
      console.error('[Bingo] 获取解决方案失败:', e)
      return null
    }
  }

  // 生成哈希值
  generateHash(data) {
    return crypto.createHash('md5').update(data).digest('hex')
  }

  // 发送今日题目
  async sendBingoImage() {
    try {
      const { image } = this.getTodayDataPath()
      const today = dataManager.getToday()

      // 强制绕过缓存，获取最新题目数据
      const imageUrl = `${image}?t=${Date.now()}`
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) throw new Error('图片未找到')
      const imageBuffer = await imageResponse.arrayBuffer()
      const imageHash = this.generateHash(Buffer.from(imageBuffer))

      // 强制绕过缓存，获取最新答案数据
      const solutionUrl = `${this.getTodayDataPath().solution}?t=${Date.now()}`
      const solutions = await this.fetchSolutions(solutionUrl)
      if (!solutions) throw new Error('答案数据未找到')
      const answerHash = this.generateHash(JSON.stringify(solutions))

      // 检查日期是否变化
      if (dataManager.state.hashData.date !== today) {
        // 日期变化，重置哈希值和每日统计
        dataManager.state.hashData = {
          date: today,
          imageHash: '',
          answerHash: ''
        }
        dataManager.state.correctUsers.clear()
      }

      // 比对哈希值
      const isImageMatch = dataManager.state.hashData.imageHash === imageHash
      const isAnswerMatch = dataManager.state.hashData.answerHash === answerHash

      if (isImageMatch && isAnswerMatch) {
        // 完全匹配，直接返回题目
        return await this.reply([
          {
            type: 'image',
            file: image
          },
          `今日已有 ${dataManager.state.correctUsers.size} 人作答正确\n`,
          '格式为#bingo xx xx，xx的第1个数代表行，第2个数代表列。\n',
          '周围指的是一圈八个格子，不包括自己'
        ])
      } else if (isImageMatch || isAnswerMatch) {
        // 部分匹配，返回提示
        return await this.reply('题目正在生成中，要不等等看？')
      } else {
        // 完全不匹配，更新哈希值并重置今日数据
        dataManager.state.hashData = {
          date: today,
          imageHash,
          answerHash
        }
        dataManager.state.correctUsers.clear()

        // 保存哈希值到文件
        fs.writeFileSync(
          path.join(dataManager.dataDir, 'hashData.json'),
          JSON.stringify(dataManager.state.hashData, null, 2)
        )

        return await this.reply([
          {
            type: 'image',
            file: image
          },
          `今日已有 ${dataManager.state.correctUsers.size} 人作答正确\n`,
          '（题目已更新）\n',
          '格式为#bingo xx xx，xx的第1个数代表行，第2个数代表列。\n',
          '周围指的是一圈八个格子，不包括自己'
        ])
      }
    } catch (e) {
      await this.reply('获取今日题目失败，请稍后再试')
      console.error('[Bingo] 发送图片失败:', e)
    }
  }

  // 解析用户输入坐标
  parseInput(input) {
    const coords = new Set()
    const matches = input.matchAll(/([1-5])([1-5])/g)
    
    for (const match of matches) {
      const row = parseInt(match[1]) - 1
      const col = parseInt(match[2]) - 1
      coords.add(`${row},${col}`)
    }
    
    return coords.size > 0 ? coords : null
  }

  // 验证答案
  async checkAnswer() {
    const userId = this.e.user_id
    const input = this.e.msg
  
    try {
      // 解析用户输入
      const userCoords = this.parseInput(input)
      if (!userCoords) {
        return await this.reply('坐标格式错误，栗子（例子）：#bingo 11 23 35')
      }
  
      // 获取解决方案
      const { solution } = this.getTodayDataPath()
      const solutions = await this.fetchSolutions(solution)
  
      if (!solutions || solutions.length === 0) {
        return await this.reply('今日题目数据尚未生成，等等看')
      }
  
      // 预生成解的特征码
      const solutionHashes = solutions.map(grid => {
        const cells = grid.flatMap((row, x) =>
          row.filter(cell => cell.checked)
            .map(cell => `${x},${cell.y}`)
        )
        return new Set(cells)
      })
  
      // 用户输入特征码
      const userHash = new Set([...userCoords])
  
      // 验证逻辑
      const isValid = solutionHashes.some(solutionHash =>
        solutionHash.size === userHash.size &&
        [...solutionHash].every(coord => userHash.has(coord))
      )
  
      if (isValid) {
        if (!dataManager.state.correctUsers.has(userId)) {
          dataManager.state.correctUsers.set(userId, Date.now())
          // 立即保存用户数据
          dataManager.persistDailyData(dataManager.getToday())
          await this.reply([
            `🎉 作答正确！`,
            `你是今日第${dataManager.state.correctUsers.size}位回答正确者呢(￣▽￣)*`
          ])
        } else {
          const ranking = this.getUserRanking(userId)
          await this.reply([
            `你已经提交过答案了呢，\n`,
            `你今日的排名是第${ranking}位，咕咕咕！`
          ])
        }
      } else {
        return await this.reply('❌ 验证失败，未找到完全匹配的解QWQ')
      }
    } catch (e) {
      await this.reply('验证服务暂时不可用')
      console.error('[Bingo] 验证错误:', e)
    }
  }

  // 获取用户今日排名
  getUserRanking(userId) {
    const today = dataManager.getToday()
    const dailyRanking = dataManager.state.ranking.get(today) || []
    const index = dailyRanking.indexOf(userId)
    return index === -1 ? -1 : index + 1
  }

  // 查询用户今日排名
  async queryRanking() {
    const userId = this.e.user_id
    const ranking = this.getUserRanking(userId)

    if (ranking !== -1) {
      await this.reply(`你今日的排名是第${ranking}位，咕咕咕！`)
    } else {
      await this.reply('你今日尚未提交答案呢(￣▽￣)')
    }
  }
}