<template>
  <div class="page-container">
    <van-nav-bar title="我的交易" left-arrow @click-left="router.back" />

    <van-tabs v-model:active="role" @change="fetchTrades">
      <van-tab title="我买到的" name="buyer" />
      <van-tab title="我卖出的" name="seller" />
    </van-tabs>

    <van-loading v-if="loading" class="loading-center" />

    <div v-else-if="trades.length" class="trade-list">
      <div v-for="t in trades" :key="t.id" class="trade-item" @click="goDetail(t.id)">
        <van-image :src="t.book?.images?.[0]" width="60" height="60" fit="cover" radius="6" />
        <div class="trade-info">
          <div class="trade-title">{{ t.book?.title || t.purchaseRequest?.bookTitle || '教材' }}</div>
          <div class="trade-tags">
            <van-tag plain type="primary">{{ t.book?.courseCode || t.purchaseRequest?.courseCode }}</van-tag>
            <van-tag plain type="primary">{{ t.book?.edition || t.purchaseRequest?.edition }}</van-tag>
          </div>
          <div class="trade-bottom">
            <span class="trade-price">¥{{ t.price }}</span>
            <van-tag :type="tradeStatusTagType[t.status]">{{ tradeStatusMap[t.status] }}</van-tag>
          </div>
        </div>
      </div>
    </div>
    <van-empty v-else description="暂无交易记录" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { getMyTrades } from '@/api/trade';
import type { Trade } from '@/types';
import { tradeStatusMap, tradeStatusTagType } from '@/types';

const router = useRouter();
const route = useRoute();
const role = ref<'buyer' | 'seller'>(route.query.role === 'seller' ? 'seller' : 'buyer');
const loading = ref(false);
const trades = ref<Trade[]>([]);

const fetchTrades = async () => {
  loading.value = true;
  try {
    const res = await getMyTrades({ role: role.value });
    trades.value = res.trades;
  } finally {
    loading.value = false;
  }
};

const goDetail = (id: string) => router.push(`/trade/${id}`);

onMounted(fetchTrades);
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 80px;
}
.trade-list {
  padding: 12px;
}
.trade-item {
  display: flex;
  gap: 10px;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.trade-info {
  flex: 1;
  min-width: 0;
}
.trade-title {
  font-size: 14px;
  font-weight: 500;
}
.trade-tags {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.trade-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.trade-price {
  color: #ee0a24;
  font-weight: 700;
}
</style>
