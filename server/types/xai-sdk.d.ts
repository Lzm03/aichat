declare module "xai-sdk" {
  interface ImageSampleParams {
    prompt: string;
    model?: string;
  }

  interface ImageSampleResponse {
    url: string;
  }

  class ImageAPI {
    sample(params: ImageSampleParams): Promise<ImageSampleResponse>;
  }

  export class Client {
    constructor(config: { apiKey?: string });

    image: ImageAPI;
  }
}