<template>
  <div>
    <el-divider content-position="left">
      全局设置
    </el-divider>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-form-item label="心跳间隔 (ms)">
          <el-input-number v-model="form.heartInterval" :min="1000" :max="600000" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="本地文件转URL">
          <el-switch v-model="form.enableLocalFile2Url" />
        </el-form-item>
      </el-col>
    </el-row>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-form-item label="调试模式">
          <el-switch v-model="form.debug" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="日志">
          <el-switch v-model="form.log" />
        </el-form-item>
      </el-col>
    </el-row>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-form-item label="自动删除收到的文件">
          <el-switch v-model="form.autoDeleteFile" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="自动删除文件时间 (秒)">
          <el-input-number v-model="form.autoDeleteFileSecond" :min="1" :max="3600" />
        </el-form-item>
      </el-col>
    </el-row>
    <el-form-item label="音乐签名地址">
      <el-input v-model="form.musicSignUrl" placeholder="请输入音乐签名地址" clearable />
    </el-form-item>
    <el-form-item label="消息缓存过期 (秒)">
      <el-input-number v-model="form.msgCacheExpire" :min="1" :max="86400" />
    </el-form-item>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-form-item label="接收离线消息">
          <el-switch v-model="form.receiveOfflineMsg" />
          <el-tooltip content="开启后将接收离线消息" placement="top">
            <el-icon class="info-icon">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="只监听本地地址">
          <el-switch v-model="form.onlyLocalhost" />
          <el-tooltip content="取消则监听0.0.0.0，暴露在公网请务必填写 Token ！" placement="top">
            <el-icon class="info-icon">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>
      </el-col>
    </el-row>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-form-item label="webui 密码">
          <el-input v-model="form.webui.token"
                    show-password
                    @change='handleWebuiToken'
                    placeholder="请输入密码" clearable />
        </el-form-item>
      </el-col>
    </el-row>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
const props = defineProps<{ modelValue: any }>()
const form = computed({
  get: () => props.modelValue,
  set: (val) => props.modelValue.value = val
})
function handleWebuiToken(v: string){

}
</script>
<style scoped>
.info-icon {
  margin-left: 8px;
  color: #909399;
}
</style>
