<template>
  <div class="purchase-card" @click="$emit('click')">
    <div class="purchase-header">
      <div class="purchase-title">{{ request.bookTitle }}</div>
      <van-tag v-if="request.status === 'active'" type="primary">求购中</van-tag>
      <van-tag v-else type="default">已关闭</van-tag>
    </div>
    <div class="purchase-meta" v-if="request.author">
      <span>作者：{{ request.author }}</span>
    </div>
    <div class="purchase-tags">
      <van-tag plain type="primary">课程 {{ request.courseCode }}</van-tag>
      <van-tag plain type="primary">{{ request.edition }}</van-tag>
      <van-tag v-if="request.expectedPrice" plain type="danger">期望 ¥{{ request.expectedPrice }}</van-tag>
    </div>
    <div class="purchase-meta" v-if="request.conditions?.length">
      <span>新旧要求：{{ request.conditions.map((c) => conditionMap[c as BookCondition]).join('、') }}</span>
    </div>
    <div class="purchase-footer">
      <span>{{ categoryMap[request.category] }} · {{ request.campus }}</span>
      <div class="requester" v-if="request.requester">
        <van-icon name="user-o" size="12" />
        <span>{{ request.requester.name || request.requester.department || '匿名' }}</span>
      </div>
    </div>
    <div class="candidate-row" v-if="request.status === 'active'">
      <van-icon name="apps-o" size="13" />
      <span :class="{ zero: request.candidateCount === 0 }">
        剩余同版候选 {{ request.candidateCount ?? 0 }} 本
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PurchaseRequest, BookCondition } from '@/types';
import { categoryMap, conditionMap } from '@/types';

defineProps<{
  request: PurchaseRequest;
}>();
defineEmits<{
  click: [];
}>();
</script>

<style scoped>
.purchase-card {
  background: white;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.purchase-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.purchase-title {
  font-size: 15px;
  font-weight: 500;
  color: #1a1a1a;
  flex: 1;
  margin-right: 8px;
}
.purchase-meta {
  font-size: 13px;
  color: #666;
  margin-top: 8px;
}
.purchase-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.purchase-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  font-size: 12px;
  color: #999;
}
.requester {
  display: flex;
  align-items: center;
  gap: 4px;
}
.candidate-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
  color: #1989fa;
}
.candidate-row.zero,
.candidate-row .zero {
  color: #999;
}
</style>
