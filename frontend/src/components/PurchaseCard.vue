<template>
  <div class="purchase-card" @click="$emit('click')">
    <div class="purchase-header">
      <div class="purchase-title">{{ request.bookTitle }}</div>
      <van-tag :type="statusTag.type">{{ statusTag.text }}</van-tag>
    </div>

    <div class="match-tags">
      <van-tag plain type="primary">{{ request.campus }}</van-tag>
      <van-tag plain type="primary">{{ request.courseCode }}</van-tag>
      <van-tag plain type="primary">{{ request.edition }}</van-tag>
    </div>

    <div class="purchase-meta" v-if="request.author">
      <span>作者：{{ request.author }}</span>
    </div>
    <div class="purchase-meta" v-if="request.expectedPrice">
      <span class="price">期望价格：¥{{ request.expectedPrice }}</span>
    </div>
    <div class="purchase-meta" v-if="conditionText">
      <span>新旧要求：{{ conditionText }}</span>
    </div>

    <div class="purchase-footer">
      <span class="candidate" :class="{ zero: candidateCount === 0 }">
        <van-icon name="books-o" />
        剩余候选书 {{ candidateCount }} 本
      </span>
      <div class="requester" v-if="request.requester">
        <van-icon name="user-o" size="12" />
        <span>{{ request.requester.name || request.requester.department || '匿名' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PurchaseRequest } from '@/types';
import { conditionMap, purchaseStatusMap } from '@/types';

const props = defineProps<{
  request: PurchaseRequest;
}>();

defineEmits<{
  click: [];
}>();

const candidateCount = computed(() => props.request.candidateCount ?? 0);

const statusTag = computed(() => {
  switch (props.request.status) {
    case 'active':
      return { type: 'primary' as const, text: purchaseStatusMap.active };
    case 'matched':
      return { type: 'warning' as const, text: purchaseStatusMap.matched };
    default:
      return { type: 'default' as const, text: purchaseStatusMap.closed };
  }
});

const conditionText = computed(() =>
  (props.request.conditions ?? []).map((c) => conditionMap[c as keyof typeof conditionMap] ?? c).join('、'),
);

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
.match-tags {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.purchase-meta {
  font-size: 13px;
  color: #666;
  margin-top: 8px;
}
.purchase-meta .price {
  color: #ff4d4f;
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
.candidate {
  color: #1989fa;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.candidate.zero {
  color: #999;
}
.requester {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
