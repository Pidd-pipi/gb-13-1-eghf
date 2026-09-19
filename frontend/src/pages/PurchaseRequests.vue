<template>
  <div class="page-container">
    <van-nav-bar title="求购信息" left-arrow @click-left="router.back">
      <template #right>
        <van-icon name="plus" size="20" @click="goPublish" />
      </template>
    </van-nav-bar>

    <van-dropdown-menu>
      <van-dropdown-item v-model="filters.category" :options="categoryOptions" title="分类" />
      <van-dropdown-item v-model="filters.campus" :options="campusFilterOptions" title="校区" />
    </van-dropdown-menu>

    <van-pull-refresh v-model="refreshing" @refresh="fetchRequests">
      <div class="requests-list">
        <van-loading v-if="loading && !refreshing" />
        <PurchaseCard
          v-else-if="requests.length > 0"
          v-for="item in requests"
          :key="item.id"
          :request="item"
          @click="goDetail(item.id)"
        />
        <van-empty v-else description="暂无求购信息" />
      </div>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getPurchaseRequests } from '@/api/purchase';
import PurchaseCard from '@/components/PurchaseCard.vue';
import { campuses } from '@/constants';
import type { PurchaseRequest, SubjectCategory } from '@/types';

const router = useRouter();
const loading = ref(false);
const refreshing = ref(false);
const requests = ref<PurchaseRequest[]>([]);

const filters = reactive({
  category: '' as SubjectCategory | '',
  campus: '',
});

const categoryOptions = [
  { text: '全部分类', value: '' },
  { text: '理工', value: 'science' },
  { text: '文史', value: 'humanities' },
  { text: '经管', value: 'business' },
  { text: '艺术', value: 'arts' },
  { text: '其他', value: 'other' },
];

const campusFilterOptions = [
  { text: '全部校区', value: '' },
  ...campuses.map((c) => ({ text: c, value: c })),
];

const fetchRequests = async () => {
  loading.value = true;
  try {
    const params: { category?: SubjectCategory; campus?: string } = {};
    if (filters.category) params.category = filters.category;
    if (filters.campus) params.campus = filters.campus;
    const result = await getPurchaseRequests(params);
    requests.value = result.requests;
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
};

const goPublish = () => router.push('/publish-request');
const goDetail = (id: string) => router.push(`/purchase-request/${id}`);

watch(
  () => [filters.category, filters.campus],
  fetchRequests,
);
onMounted(fetchRequests);
</script>

<style scoped>
.requests-list {
  padding: 12px;
}
</style>
