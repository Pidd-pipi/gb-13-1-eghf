<template>
  <div class="page-container">
    <van-nav-bar title="发布求购" left-arrow @click-left="router.back" />

    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <van-field
          v-model="form.bookTitle"
          name="bookTitle"
          label="书名"
          placeholder="请输入需要的教材书名"
          :rules="[{ required: true, message: '请输入书名' }]"
        />
        <van-field v-model="form.author" name="author" label="作者" placeholder="选填" />
        <van-field v-model="form.isbn" name="isbn" label="ISBN" placeholder="选填" />

        <van-field
          v-model="form.courseCode"
          name="courseCode"
          label="课程代码"
          placeholder="如 CS101，用于教材同版匹配"
          :rules="[{ required: true, message: '请填写课程代码' }]"
        />
        <van-field
          v-model="form.edition"
          name="edition"
          label="版次"
          placeholder="如 第2版 / 2023版"
          :rules="[{ required: true, message: '请填写版次' }]"
        />

        <van-field
          v-model.number="form.expectedPrice"
          type="number"
          name="expectedPrice"
          label="期望价格"
          placeholder="¥ 选填，仅匹配不超过该价格的书"
        >
          <template #left-icon>
            <van-icon name="balance-o" />
          </template>
        </van-field>

        <van-field name="conditions" label="新旧要求">
          <template #input>
            <van-checkbox-group v-model="form.conditions" direction="horizontal">
              <van-checkbox name="new" shape="square">全新</van-checkbox>
              <van-checkbox name="like_new" shape="square">九成新</van-checkbox>
              <van-checkbox name="good" shape="square">七成新</van-checkbox>
              <van-checkbox name="fair" shape="square">五成新</van-checkbox>
            </van-checkbox-group>
          </template>
        </van-field>

        <van-field name="campus" label="校区" :rules="[{ required: true, message: '请选择校区' }]">
          <template #input>
            <van-picker
              :columns="campuses"
              @confirm="onCampusConfirm"
              v-model:show="showCampusPicker"
            >
              <template #title>选择校区</template>
            </van-picker>
            <div @click="showCampusPicker = true">{{ form.campus || '请选择' }}</div>
          </template>
        </van-field>

        <van-field name="category" label="分类" :rules="[{ required: true, message: '请选择分类' }]">
          <template #input>
            <van-radio-group v-model="form.category" direction="horizontal">
              <van-radio name="science">理工</van-radio>
              <van-radio name="humanities">文史</van-radio>
              <van-radio name="business">经管</van-radio>
              <van-radio name="arts">艺术</van-radio>
              <van-radio name="other">其他</van-radio>
            </van-radio-group>
          </template>
        </van-field>

        <van-field
          v-model="form.description"
          name="description"
          label="备注"
          type="textarea"
          placeholder="其他要求，选填"
          rows="3"
        />
      </van-cell-group>

      <div class="submit-actions">
        <van-button round block type="primary" native-type="submit" :loading="loading">
          发布求购
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { createPurchaseRequest } from '@/api/purchase';

const router = useRouter();
const loading = ref(false);
const showCampusPicker = ref(false);

const form = reactive({
  bookTitle: '',
  author: '',
  isbn: '',
  courseCode: '',
  edition: '',
  expectedPrice: undefined as number | undefined,
  conditions: [] as string[],
  campus: '',
  category: '',
  description: '',
});

const campuses = [
  { text: '主校区', value: '主校区' },
  { text: '东校区', value: '东校区' },
  { text: '西校区', value: '西校区' },
  { text: '南校区', value: '南校区' },
  { text: '北校区', value: '北校区' },
];

const onCampusConfirm = ({ selectedOptions }: any) => {
  form.campus = selectedOptions[0]?.text || '';
  showCampusPicker.value = false;
};

const onSubmit = async () => {
  loading.value = true;
  try {
    await createPurchaseRequest({
      bookTitle: form.bookTitle,
      author: form.author || undefined,
      isbn: form.isbn || undefined,
      courseCode: form.courseCode,
      edition: form.edition,
      expectedPrice: form.expectedPrice || undefined,
      conditions: form.conditions.length ? form.conditions : undefined,
      campus: form.campus,
      category: form.category as any,
      description: form.description || undefined,
    });
    showToast('求购信息发布成功');
    router.replace('/home');
  } catch {
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.submit-actions {
  padding: 24px;
}
</style>
