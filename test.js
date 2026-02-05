import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

const url = "https://YOUR_DISTRIBUTION.cloudfront.net/test.txt";

const privateKey = process.env.CLOUDFRONT_PRIVATE_KEY.replace(/\\n/g, "\n");

const signedUrl = getSignedUrl({
    url,
    keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID,
    privateKey,
    dateLessThan: new Date(Date.now() + 600 * 1000), // 10 minutes
});

console.log(signedUrl);