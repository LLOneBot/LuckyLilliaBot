<script setup lang='ts'>
import { Document, Link, User } from '@element-plus/icons-vue'
</script>

<template>
  <div class="about-container">
    <el-card class="about-card">
      <el-divider content-position="left">
        <el-icon><Link /></el-icon>
        <span style="margin-left: 6px;">GitHub</span>
      </el-divider>
      <el-row justify="center">
        <el-col>
          <a href="https://github.com/LLOneBot/LLOneBot" target="_blank">
            https://github.com/LLOneBot/LLOneBot
          </a>
        </el-col>
      </el-row>
    </el-card>
    <el-card class="about-card">
      <el-divider content-position="left">
        <el-icon><Document /></el-icon>
        <span style="margin-left: 6px;">文档</span>
      </el-divider>
      <el-row justify="center">
        <el-col>
          <a href="https://llonebot.com" target="_blank">https://llonebot.com</a>
        </el-col>
      </el-row>
    </el-card>
    <el-card class="about-card">
      <el-divider content-position="left">
        <el-icon><User /></el-icon>
        <span style="margin-left: 6px;">QQ 群</span>
      </el-divider>
      <el-row justify="center" align="middle">
        <el-col>
          <a href="https://qm.qq.com/q/EZndy3xntQ" target="_blank" class="qq-link">
            545402644
          </a>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<style scoped>
.about-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 32px;
}
.about-card {
  width: 100%;
  box-shadow: 0 2px 12px #0001;
  border-radius: 12px;
  padding: 10px 0 10px 0;
}
.el-divider {
  font-size: 1.1em;
  color: #409eff;
}
.el-row {
  margin-bottom: 8px;
  margin-left: 30px;
}
.qq-link {
  font-size: 1.15em;
  color: #409eff;
  font-weight: bold;
  text-decoration: none;
  transition: color 0.2s;
}
.qq-link:hover {
  color: #66b1ff;
  text-decoration: underline;
}
</style>
